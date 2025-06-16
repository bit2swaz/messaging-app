// client/src/components/ChatWindow.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './ChatWindow.module.css';

const ChatWindow = () => {
  const { userId: recipientId } = useParams();
  const { user: currentUser, supabase } = useAuth();

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [recipient, setRecipient] = useState(null);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  // Effect to fetch recipient profile
  useEffect(() => {
    const fetchRecipientProfile = async () => {
      if (!supabase || !recipientId) return;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .eq('id', recipientId)
          .single();
        if (error) throw error;
        setRecipient(data);
      } catch (err) {
        console.error('Error fetching recipient profile:', err.message);
        setError('Failed to load recipient profile.');
        setRecipient(null);
      }
    };
    fetchRecipientProfile();
  }, [supabase, recipientId]);

  // Effect to fetch messages and set up Realtime listener
  useEffect(() => {
    if (!supabase || !currentUser || !recipientId) return;

    setError(null);

    const fetchMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${recipientId},sender_id.eq.${recipientId},receiver_id.eq.${currentUser.id}`)
          .order('created_at', { ascending: true });
        if (error) throw error;
        setMessages(data);
      } catch (err) {
        console.error('ChatWindow: Error fetching initial messages from Supabase:', err.message);
        setError(`Failed to load messages: ${err.message}`);
        setMessages([]);
      }
    };

    fetchMessages();

    const channelName = `dm_${[currentUser.id, recipientId].sort().join('_')}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMessagePayload = payload.new;
        const isRelevant =
          (newMessagePayload.sender_id === currentUser.id && newMessagePayload.receiver_id === recipientId) ||
          (newMessagePayload.sender_id === recipientId && newMessagePayload.receiver_id === currentUser.id);

        if (isRelevant) {
          // Check if the message is already in state (from optimistic update)
          // This prevents duplicates if optimistic update added it and then Realtime sends it back
          setMessages((prevMessages) => {
            if (!prevMessages.find(msg => msg.id === newMessagePayload.id)) {
              return [...prevMessages, newMessagePayload];
            }
            return prevMessages; // Message already exists, no duplicate
          });
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`ChatWindow: Successfully SUBSCRIBED to Realtime channel: ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`ChatWindow: Error subscribing to channel ${channelName}.`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, currentUser, recipientId]);

  // Effect for auto-scrolling to the bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !recipientId) {
      setError('Message cannot be empty or user/recipient not defined.');
      return;
    }

    setError(null);

    // Optimistic UI: Create a temporary message ID and add the message to the state immediately
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimisticMessage = {
      id: tempId, // Temporary ID
      sender_id: currentUser.id,
      receiver_id: recipientId,
      content: newMessage.trim(),
      created_at: new Date().toISOString(), // Use client-side timestamp for immediate display
      is_optimistic: true, // Flag to identify optimistic message
    };

    setMessages((prevMessages) => [...prevMessages, optimisticMessage]);
    setNewMessage(''); // Clear input field immediately

    try {
      const messageToInsert = {
        sender_id: currentUser.id,
        receiver_id: recipientId,
        content: optimisticMessage.content, // Use content from optimistic message
      };

      const { data, error } = await supabase
        .from('messages')
        .insert([messageToInsert])
        .select(); // Get the actual message from DB with its real ID

      if (error) {
        throw error;
      }

      // Replace optimistic message with the actual message from the database
      // The Realtime listener will also receive this, but this handles potential race conditions
      // and ensures the actual message ID and server-generated created_at are used.
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === tempId ? { ...data[0], is_optimistic: false } : msg
        )
      );

    } catch (err) {
      console.error('ChatWindow: Caught error in handleSendMessage:', err.message);
      setError(`Failed to send message: ${err.message}`);
      // If send fails, remove the optimistic message
      setMessages((prevMessages) => prevMessages.filter(msg => msg.id !== tempId));
    }
  };

  if (error) {
    return <div className={styles.chatWindowError}>{error}</div>;
  }

  if (!recipient) {
    return <div className={styles.chatWindowLoading}>Loading chat...</div>;
  }

  return (
    <div className={styles.chatWindowContainer}>
      <div className={styles.chatHeader}>
        <img
          src={recipient.avatar_url || `https://placehold.co/40x40/5865F2/FFFFFF?text=${recipient.username ? recipient.username[0].toUpperCase() : '?'}`}
          alt={`${recipient.username}'s Avatar`}
          className={styles.recipientAvatar}
        />
        <h2>{recipient.username}</h2>
      </div>

      <div className={styles.messagesContainer}>
        {messages.length === 0 && (
          <p className={styles.noMessages}>Start a conversation with {recipient.username}!</p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`${styles.messageBubble} ${
              msg.sender_id === currentUser.id ? styles.sent : styles.received
            } ${msg.is_optimistic ? styles.optimisticMessage : ''}`} /* Apply optimistic style */
          >
            <p className={styles.messageContent}>{msg.content}</p>
            <span className={styles.messageTimestamp}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className={styles.messageInputForm}>
        <input
          type="text"
          placeholder={`Message @${recipient.username}...`}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          className={styles.messageInputField}
        />
        <button type="submit" className={styles.sendButton}>Send</button>
      </form>
    </div>
  );
};

export default ChatWindow;
