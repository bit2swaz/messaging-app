// client/src/components/ChatWindow.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './ChatWindow.module.css';

const ChatWindow = () => {
  const { userId, channelId } = useParams();
  const { user: currentUser, supabase } = useAuth();

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatPartner, setChatPartner] = useState(null);
  const [error, setError] = useState(null);
  const [tempMessageError, setTempMessageError] = useState(null);
  const messagesEndRef = useRef(null);

  const isDM = !!userId;
  const isChannel = !!channelId;

  // Effect to fetch chat partner profile (recipient for DM or channel details for group)
  useEffect(() => {
    const fetchChatPartnerDetails = async () => {
      if (!supabase || (!userId && !channelId)) {
        setChatPartner(null);
        return;
      }
      setError(null);

      try {
        if (isDM) {
          console.log('ChatWindow: Fetching DM recipient profile:', userId);
          const { data, error } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .eq('id', userId)
            .single();

          if (error) throw error;
          setChatPartner({ type: 'user', ...data });
          console.log('ChatWindow: DM recipient profile fetched:', data.username);
        } else if (isChannel) {
          console.log('ChatWindow: Fetching channel details:', channelId);
          const { data, error } = await supabase
            .from('channels')
            .select('id, name, description')
            .eq('id', channelId)
            .single();

          if (error) throw error;
          setChatPartner({ type: 'channel', ...data });
          console.log('ChatWindow: Channel details fetched:', data.name);
        }
      } catch (err) {
        console.error('ChatWindow: Error fetching chat partner details:', err.message);
        setError(`Failed to load chat: ${err.message}`);
        setChatPartner(null);
      }
    };
    fetchChatPartnerDetails();
  }, [supabase, userId, channelId, isDM, isChannel]);

  // Effect to fetch messages and set up Realtime listener
  useEffect(() => {
    if (!supabase || !currentUser || (!isDM && !isChannel)) return;

    setError(null);

    const fetchMessages = async () => {
      try {
        // --- CRITICAL CHANGE HERE: Join with profiles table to get sender's username ---
        let query = supabase.from('messages')
          .select(`
            *,
            sender_id:profiles(username, avatar_url) // Select username and avatar from profiles table
          `)
          .order('created_at', { ascending: true });

        if (isDM) {
          query = query.or(`sender_id.eq.${currentUser.id},receiver_id.eq.${userId},sender_id.eq.${userId},receiver_id.eq.${currentUser.id}`);
          query = query.is('channel_id', null);
          console.log(`ChatWindow: Fetching DM messages for ${currentUser.id} and ${userId}`);
        } else if (isChannel) {
          query = query.eq('channel_id', channelId);
          console.log(`ChatWindow: Fetching channel messages for channel ${channelId}`);
        } else {
          console.warn('ChatWindow: Neither DM nor Channel ID present for message fetch.');
          return;
        }

        const { data, error } = await query;
        if (error) throw error;
        setMessages(data);
        console.log('ChatWindow: Fetched messages (with sender profiles):', data); // Log to verify structure
      } catch (err) {
        console.error('ChatWindow: Error fetching initial messages from Supabase:', err.message);
        setError(`Failed to load messages: ${err.message}`);
        setMessages([]);
      }
    };

    fetchMessages();

    const realtimeChannelName = isDM
      ? `dm_${[currentUser.id, userId].sort().join('_')}`
      : `channel_${channelId}`;

    console.log(`ChatWindow: Subscribing to Realtime channel: ${realtimeChannelName}`);
    const channel = supabase
      .channel(realtimeChannelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => { // Made async to fetch sender data
        const newMessagePayload = payload.new;
        let isRelevant = false;

        if (isDM) {
          isRelevant =
            ((newMessagePayload.sender_id === currentUser.id && newMessagePayload.receiver_id === userId) ||
            (newMessagePayload.sender_id === userId && newMessagePayload.receiver_id === currentUser.id)) &&
            newMessagePayload.channel_id === null;
        } else if (isChannel) {
          isRelevant = newMessagePayload.channel_id === channelId;
        }

        if (isRelevant) {
          // --- CRITICAL CHANGE HERE for Realtime messages: Fetch sender profile ---
          // Need to fetch the sender's username for the newly inserted message
          const { data: senderProfile, error: profileError } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', newMessagePayload.sender_id)
            .single();

          if (profileError) {
            console.error('ChatWindow: Error fetching sender profile for Realtime message:', profileError.message);
            // Fallback: If profile fetch fails, still add message without username
            newMessagePayload.sender_id = { username: 'Unknown User' }; // Dummy object
          } else {
            newMessagePayload.sender_id = senderProfile; // Overwrite sender_id with profile object
          }
          // --- END CRITICAL CHANGE ---

          setMessages((prevMessages) => {
            if (!prevMessages.find(msg => msg.id === newMessagePayload.id)) {
              return [...prevMessages, newMessagePayload];
            }
            return prevMessages;
          });
          console.log('ChatWindow: New relevant message received via Realtime (with sender profile):', newMessagePayload);
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

    return () => {
      console.log(`ChatWindow: Unsubscribing from Realtime channel: ${realtimeChannelName}`);
      supabase.removeChannel(channel);
    };
  }, [supabase, currentUser, userId, channelId, isDM, isChannel]);

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
      sender_id: { // For optimistic message, mock the sender_id as a profile object
        id: currentUser.id,
        username: currentUser.user_metadata?.username || currentUser.email,
        avatar_url: currentUser.user_metadata?.avatar_url
      },
      content: newMessage.trim(),
      created_at: new Date().toISOString(),
      is_optimistic: true,
      ...(isDM && { receiver_id: userId }),
      ...(isChannel && { channel_id: channelId }),
    };

    setMessages((prevMessages) => [...prevMessages, optimisticMessage]);
    setNewMessage('');

    try {
      const messageToInsert = {
        sender_id: currentUser.id, // Actual ID for DB insertion
        content: optimisticMessage.content,
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

      // Realtime listener will handle actual message update, but we ensure optimistic UI is correctly replaced
      // The Realtime payload already includes the joined sender data, so we might not need this map anymore
      // if the Realtime listener fires fast enough. However, keeping for robustness.
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === tempId ? { ...data[0], is_optimistic: false, sender_id: optimisticMessage.sender_id } : msg // Keep optimistic sender_id mock
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

  if (!chatPartner) {
    return <div className={styles.chatWindowLoading}>Loading chat...</div>;
  }

  const chatHeaderName = isDM ? chatPartner.username : chatPartner.name;
  const chatHeaderAvatar = isDM
    ? chatPartner.avatar_url || `https://placehold.co/40x40/5865F2/FFFFFF?text=${chatPartner.username ? chatPartner.username[0].toUpperCase() : '?'}`
    : `https://placehold.co/40x40/7289DA/FFFFFF?text=#`;

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
              msg.sender_id.id === currentUser.id ? styles.sent : styles.received // Use msg.sender_id.id for comparison
            } ${msg.is_optimistic ? styles.optimisticMessage : ''}`}
          >
            {/* NEW: Display sender's username for channel messages */}
            {isChannel && msg.sender_id.id !== currentUser.id && ( // Only show for received channel messages
              <div className={styles.messageSenderInfo}>
                <img
                  src={msg.sender_id.avatar_url || `https://placehold.co/24x24/40444B/FFFFFF?text=${msg.sender_id.username ? msg.sender_id.username[0].toUpperCase() : '?'}`}
                  alt={`${msg.sender_id.username}'s Avatar`}
                  className={styles.messageSenderAvatar}
                />
                <span className={styles.messageSenderUsername}>{msg.sender_id.username}</span>
              </div>
            )}
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
