// client/src/components/ChatWindow.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './ChatWindow.module.css';

const ChatWindow = () => {
  // useParams will give us both userId and channelId if they exist in the URL
  const { userId, channelId } = useParams(); // Now destructure both
  const { user: currentUser, supabase } = useAuth();

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  // New state to hold the "chat partner" (recipient for DMs or channel info for groups)
  const [chatPartner, setChatPartner] = useState(null);
  const [error, setError] = useState(null);
  const [tempMessageError, setTempMessageError] = useState(null);
  const messagesEndRef = useRef(null);

  // Determine if it's a DM or Channel chat
  const isDM = !!userId; // True if userId exists in params
  const isChannel = !!channelId; // True if channelId exists in params

  // Effect to fetch chat partner profile (recipient for DM or channel details for group)
  useEffect(() => {
    const fetchChatPartnerDetails = async () => {
      if (!supabase || (!userId && !channelId)) {
        setChatPartner(null);
        return;
      }

      setError(null); // Clear previous errors

      try {
        if (isDM) {
          // Fetch recipient profile for DM
          console.log('ChatWindow: Fetching DM recipient profile:', userId);
          const { data, error } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .eq('id', userId)
            .single();

          if (error) throw error;
          setChatPartner({ type: 'user', ...data }); // Add type for easier handling
          console.log('ChatWindow: DM recipient profile fetched:', data.username);
        } else if (isChannel) {
          // Fetch channel details for group chat
          console.log('ChatWindow: Fetching channel details:', channelId);
          const { data, error } = await supabase
            .from('channels')
            .select('id, name, description')
            .eq('id', channelId)
            .single();

          if (error) throw error;
          setChatPartner({ type: 'channel', ...data }); // Add type for easier handling
          console.log('ChatWindow: Channel details fetched:', data.name);
        }
      } catch (err) {
        console.error('ChatWindow: Error fetching chat partner details:', err.message);
        setError(`Failed to load chat: ${err.message}`);
        setChatPartner(null);
      }
    };
    fetchChatPartnerDetails();
  }, [supabase, userId, channelId, isDM, isChannel]); // Re-run if any of these change

  // Effect to fetch messages and set up Realtime listener
  useEffect(() => {
    if (!supabase || !currentUser || (!isDM && !isChannel)) return;

    setError(null); // Clear general error on chat window load

    const fetchMessages = async () => {
      try {
        let query = supabase.from('messages').select('*').order('created_at', { ascending: true });

        if (isDM) {
          // Fetch messages for Direct Message
          query = query.or(`sender_id.eq.${currentUser.id},receiver_id.eq.${userId},sender_id.eq.${userId},receiver_id.eq.${currentUser.id}`);
          // Ensure channel_id is null for DMs
          query = query.is('channel_id', null);
          console.log(`ChatWindow: Fetching DM messages for ${currentUser.id} and ${userId}`);
        } else if (isChannel) {
          // Fetch messages for Channel
          query = query.eq('channel_id', channelId);
          console.log(`ChatWindow: Fetching channel messages for channel ${channelId}`);
        } else {
          // This case should ideally not be hit due to initial check
          console.warn('ChatWindow: Neither DM nor Channel ID present for message fetch.');
          return;
        }

        const { data, error } = await query;
        if (error) throw error;
        setMessages(data);
      } catch (err) {
        console.error('ChatWindow: Error fetching initial messages from Supabase:', err.message);
        setError(`Failed to load messages: ${err.message}`);
        setMessages([]);
      }
    };

    fetchMessages();

    // Determine Realtime channel name based on chat type
    const realtimeChannelName = isDM
      ? `dm_${[currentUser.id, userId].sort().join('_')}` // DM channel name
      : `channel_${channelId}`; // Channel chat name

    console.log(`ChatWindow: Subscribing to Realtime channel: ${realtimeChannelName}`);
    const channel = supabase
      .channel(realtimeChannelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMessagePayload = payload.new;
        let isRelevant = false;

        if (isDM) {
          // Check if message is relevant to the current DM chat
          isRelevant =
            ((newMessagePayload.sender_id === currentUser.id && newMessagePayload.receiver_id === userId) ||
            (newMessagePayload.sender_id === userId && newMessagePayload.receiver_id === currentUser.id)) &&
            newMessagePayload.channel_id === null; // Must be a DM (channel_id is null)
        } else if (isChannel) {
          // Check if message is relevant to the current Channel chat
          isRelevant = newMessagePayload.channel_id === channelId;
        }

        if (isRelevant) {
          setMessages((prevMessages) => {
            if (!prevMessages.find(msg => msg.id === newMessagePayload.id)) {
              return [...prevMessages, newMessagePayload];
            }
            return prevMessages;
          });
          console.log('ChatWindow: New relevant message received via Realtime:', newMessagePayload);
        } else {
          console.log('ChatWindow: Realtime message received but not relevant to current chat:', newMessagePayload);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`ChatWindow: Successfully SUBSCRIBED to Realtime channel: ${realtimeChannelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`ChatWindow: Error subscribing to channel ${realtimeChannelName}.`);
        } else {
          console.log(`ChatWindow: Realtime channel subscription status: ${status}`);
        }
      });

    // Cleanup function: remove the specific channel when component unmounts or dependencies change
    return () => {
      console.log(`ChatWindow: Unsubscribing from Realtime channel: ${realtimeChannelName}`);
      supabase.removeChannel(channel);
    };
  }, [supabase, currentUser, userId, channelId, isDM, isChannel]); // Dependencies: Re-run if chat type or IDs change

  // Effect for auto-scrolling to the bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    setTempMessageError(null);

    if (!newMessage.trim()) {
      setTempMessageError('Message cannot be empty.');
      return;
    }
    if (!currentUser || (!isDM && !isChannel) || (!isDM && !chatPartner?.id) || (!isChannel && !chatPartner?.id)) {
      setTempMessageError('User or chat partner not defined. Please refresh.');
      return;
    }

    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimisticMessage = {
      id: tempId,
      sender_id: currentUser.id,
      content: newMessage.trim(),
      created_at: new Date().toISOString(),
      is_optimistic: true,
      // Conditionally add receiver_id or channel_id
      ...(isDM && { receiver_id: userId }),
      ...(isChannel && { channel_id: channelId }),
    };

    setMessages((prevMessages) => [...prevMessages, optimisticMessage]);
    setNewMessage('');

    try {
      const messageToInsert = {
        sender_id: currentUser.id,
        content: optimisticMessage.content,
        // Conditionally add receiver_id or channel_id for insertion
        ...(isDM && { receiver_id: userId }),
        ...(isChannel && { channel_id: channelId }),
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
      setError(`Failed to send message: ${err.message}`);
      setMessages((prevMessages) => prevMessages.filter(msg => msg.id !== tempId));
    }
  };

  if (error && !tempMessageError) {
    return <div className={styles.chatWindowError}>{error}</div>;
  }

  // Display loading until chatPartner is fetched
  if (!chatPartner) {
    return <div className={styles.chatWindowLoading}>Loading chat...</div>;
  }

  // Determine header display based on chat type
  const chatHeaderName = isDM ? chatPartner.username : chatPartner.name;
  const chatHeaderAvatar = isDM
    ? chatPartner.avatar_url || `https://placehold.co/40x40/5865F2/FFFFFF?text=${chatPartner.username ? chatPartner.username[0].toUpperCase() : '?'}`
    : `https://placehold.co/40x40/7289DA/FFFFFF?text=#`; // Generic channel avatar

  const chatPlaceholder = isDM
    ? `Message @${chatPartner.username}...`
    : `Message #${chatPartner.name}...`;

  return (
    <div className={styles.chatWindowContainer}>
      <div className={styles.chatHeader}>
        <img
          src={chatHeaderAvatar}
          alt={`${chatHeaderName}'s Avatar`}
          className={styles.recipientAvatar}
        />
        <h2>{chatHeaderName}</h2>
      </div>

      <div className={styles.messagesContainer}>
        {messages.length === 0 && (
          <p className={styles.noMessages}>Start a conversation with {chatHeaderName}!</p>
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
        {tempMessageError && <p className={styles.tempErrorMessage}>{tempMessageError}</p>}
        <input
          type="text"
          placeholder={chatPlaceholder}
          value={newMessage}
          onChange={(e) => {
            setNewMessage(e.target.value);
            if (tempMessageError) setTempMessageError(null);
          }}
          className={styles.messageInputField}
        />
        <button type="submit" className={styles.sendButton}>Send</button>
      </form>
    </div>
  );
};

export default ChatWindow;
