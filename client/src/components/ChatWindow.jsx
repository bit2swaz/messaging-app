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
  const [error, setError] = useState(null); // Persistent error state for general issues
  const [tempMessageError, setTempMessageError] = useState(null); // New: for temporary message input errors
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

    setError(null); // Clear general error on chat window load

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
          setMessages((prevMessages) => {
            if (!prevMessages.find(msg => msg.id === newMessagePayload.id)) {
              return [...prevMessages, newMessagePayload];
            }
            return prevMessages;
          });
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`ChatWindow: Successfully SUBSCRIBED to Realtime channel: ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`ChatWindow: Error subscribing to channel ${channelName}.`);
        } else {
          console.log(`ChatWindow: Realtime channel subscription status: ${status}`);
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
    setTempMessageError(null); // Clear previous temporary error

    if (!newMessage.trim()) { // Only check for empty message content
      setTempMessageError('Message cannot be empty.'); // Set temporary error
      return;
    }
    if (!currentUser || !recipientId) { // Check for user/recipient definition as before
      setTempMessageError('User or recipient not defined. Please refresh.');
      return;
    }

    // setError(null); // General errors are cleared by useEffect above.

    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimisticMessage = {
      id: tempId,
      sender_id: currentUser.id,
      receiver_id: recipientId,
      content: newMessage.trim(),
      created_at: new Date().toISOString(),
      is_optimistic: true,
    };

    setMessages((prevMessages) => [...prevMessages, optimisticMessage]);
    setNewMessage('');

    try {
      const messageToInsert = {
        sender_id: currentUser.id,
        receiver_id: recipientId,
        content: optimisticMessage.content,
      };

      const { data, error } = await supabase
        .from('messages')
        .insert([messageToInsert])
        .select();

      if (error) {
        throw error;
      }

      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === tempId ? { ...data[0], is_optimistic: false } : msg
        )
      );

    } catch (err) {
      console.error('ChatWindow: Caught error in handleSendMessage:', err.message);
      // Display this error more prominently if it affects sending.
      setError(`Failed to send message: ${err.message}`); // Set general error for persistent issues
      setMessages((prevMessages) => prevMessages.filter(msg => msg.id !== tempId));
    }
  };

  // If a general error exists, display it prominently.
  if (error && !tempMessageError) { // Only show general error if no temporary one is active
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

      <div className={styles.messagesContainer}> {/* This container will now have overflow:auto */}
        {messages.length === 0 && (
          <p className={styles.noMessages}>Start a conversation with {recipient.username}!</p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`${styles.messageBubble} ${
              msg.sender_id === currentUser.id ? styles.sent : styles.received
            } ${msg.is_optimistic ? styles.optimisticMessage : ''}`}
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
        {tempMessageError && <p className={styles.tempErrorMessage}>{tempMessageError}</p>} {/* Display temporary error here */}
        <input
          type="text"
          placeholder={`Message @${recipient.username}...`}
          value={newMessage}
          onChange={(e) => {
            setNewMessage(e.target.value);
            if (tempMessageError) setTempMessageError(null); // Clear error when user starts typing
          }}
          className={styles.messageInputField}
        />
        <button type="submit" className={styles.sendButton}>Send</button>
      </form>
    </div>
  );
};

export default ChatWindow;