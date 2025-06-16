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
      if (!supabase || !recipientId) {
        console.log('ChatWindow: Skipping fetchRecipientProfile - Supabase or recipientId not ready.');
        return;
      }
      console.log(`ChatWindow: Fetching recipient profile for ID: ${recipientId}`);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .eq('id', recipientId)
          .single();

        if (error) {
          console.error('ChatWindow: Error fetching recipient profile:', error.message);
          throw error;
        }
        setRecipient(data);
        console.log('ChatWindow: Recipient profile fetched:', data.username);
      } catch (err) {
        console.error('ChatWindow: Caught error in fetchRecipientProfile:', err.message);
        setError(`Failed to load recipient profile: ${err.message}`);
        setRecipient(null);
      }
    };
    fetchRecipientProfile();
  }, [supabase, recipientId]);

  // Effect to fetch messages and set up Realtime listener
  useEffect(() => {
    if (!supabase || !currentUser || !recipientId) {
      console.log('ChatWindow: Skipping message fetch/listener setup - Supabase, currentUser, or recipientId not ready.');
      return;
    }

    setError(null); // Clear previous errors
    console.log(`ChatWindow: Setting up message fetch and listener for chat with ${recipientId}`);

    const fetchMessages = async () => {
      console.log('ChatWindow: Attempting to fetch initial messages.');
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .or(`(sender_id.eq.${currentUser.id},receiver_id.eq.${recipientId}),(sender_id.eq.${recipientId},receiver_id.eq.${currentUser.id})`)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('ChatWindow: Error fetching initial messages from Supabase:', error.message);
          throw error;
        }

        setMessages(data);
        console.log(`ChatWindow: Fetched ${data.length} messages.`);
      } catch (err) {
        console.error('ChatWindow: Caught error during initial message fetch:', err.message);
        setError(`Failed to load messages: ${err.message}`);
        setMessages([]);
      }
    };

    fetchMessages();

    // --- Supabase Realtime Listener for new messages ---
    // Listen to inserts in the messages table that involve these two users
    // Ensure the channel name is consistent and unique for this DM
    const channelName = `dm_${[currentUser.id, recipientId].sort().join('_')}`; // Sort IDs for consistent channel name
    console.log(`ChatWindow: Subscribing to Realtime channel: ${channelName}`);

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMessagePayload = payload.new;
        console.log('ChatWindow: Realtime payload received:', newMessagePayload);

        const isRelevant =
          (newMessagePayload.sender_id === currentUser.id && newMessagePayload.receiver_id === recipientId) ||
          (newMessagePayload.sender_id === recipientId && newMessagePayload.receiver_id === currentUser.id);

        if (isRelevant) {
          setMessages((prevMessages) => [...prevMessages, newMessagePayload]);
          console.log('ChatWindow: Added new message from Realtime to state.');
        } else {
          console.log('ChatWindow: Realtime message not relevant to current chat.');
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`ChatWindow: Successfully SUBSCRIBED to Realtime channel: ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`ChatWindow: Error subscribing to channel ${channelName}.`);
        }
      });


    // Clean up subscription on component unmount or recipientId change
    return () => {
      console.log('ChatWindow: Unsubscribing from message channel and removing.');
      supabase.removeChannel(channel); // Pass the channel instance directly
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

    try {
      const messageToInsert = {
        sender_id: currentUser.id,
        receiver_id: recipientId,
        content: newMessage.trim(),
      };
      console.log('ChatWindow: Attempting to send message:', messageToInsert);
      const { data, error } = await supabase
        .from('messages')
        .insert([messageToInsert])
        .select(); // Add .select() to return the inserted data

      if (error) {
        console.error('ChatWindow: Error inserting message to Supabase:', error.message);
        throw error;
      }

      console.log('ChatWindow: Message sent successfully to DB. Inserted data:', data);
      setNewMessage('');
    } catch (err) {
      console.error('ChatWindow: Caught error in handleSendMessage:', err.message);
      setError(`Failed to send message: ${err.message}`);
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
            }`}
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
