// client/src/components/ChatWindow.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './ChatWindow.module.css';

const ChatWindow = () => {
  const { userId: recipientId } = useParams(); // Get recipient's user ID from URL
  const { user: currentUser, supabase } = useAuth(); // Current logged-in user and supabase client

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [recipient, setRecipient] = useState(null); // To store recipient's profile details
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null); // Ref for auto-scrolling to bottom

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

    setError(null); // Clear previous errors

    const fetchMessages = async () => {
      try {
        // Fetch direct messages between current user and recipient
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .or(`(sender_id.eq.${currentUser.id},receiver_id.eq.${recipientId}),(sender_id.eq.${recipientId},receiver_id.eq.${currentUser.id})`)
          .order('created_at', { ascending: true }); // Order by timestamp

        if (error) throw error;
        setMessages(data);
        console.log(`ChatWindow: Fetched ${data.length} messages for chat with ${recipientId}`);
      } catch (err) {
        console.error('ChatWindow: Error fetching messages:', err.message);
        setError('Failed to load messages.');
        setMessages([]);
      }
    };

    fetchMessages();

    // --- Supabase Realtime Listener for new messages ---
    // Listen to inserts in the messages table that involve these two users
    const subscription = supabase
      .channel(`chat_${currentUser.id}_${recipientId}`) // Unique channel name for this DM
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMessagePayload = payload.new;
        console.log('ChatWindow: New message received via Realtime:', newMessagePayload);

        // Check if the new message is relevant to this specific chat
        const isRelevant =
          (newMessagePayload.sender_id === currentUser.id && newMessagePayload.receiver_id === recipientId) ||
          (newMessagePayload.sender_id === recipientId && newMessagePayload.receiver_id === currentUser.id);

        if (isRelevant) {
          setMessages((prevMessages) => [...prevMessages, newMessagePayload]);
        }
      })
      .subscribe();

    // Clean up subscription on component unmount or recipientId change
    return () => {
      console.log('ChatWindow: Unsubscribing from message channel.');
      supabase.removeChannel(subscription);
    };
  }, [supabase, currentUser, recipientId]); // Re-run if any of these change

  // Effect for auto-scrolling to the bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]); // Scroll whenever messages array updates

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUser || !recipientId) return;

    setError(null); // Clear previous error

    try {
      const messageToInsert = {
        sender_id: currentUser.id,
        receiver_id: recipientId,
        content: newMessage.trim(),
        // created_at is automatically set by DB
      };

      // Insert message into Supabase
      const { data, error } = await supabase
        .from('messages')
        .insert([messageToInsert]);

      if (error) throw error;

      console.log('ChatWindow: Message sent successfully to DB.');
      setNewMessage(''); // Clear input field

      // Realtime listener will handle updating 'messages' state.
      // No need to manually add to state here for this real-time flow.
    } catch (err) {
      console.error('ChatWindow: Error sending message:', err.message);
      setError('Failed to send message.');
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
        <div ref={messagesEndRef} /> {/* Element to scroll into view */}
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
