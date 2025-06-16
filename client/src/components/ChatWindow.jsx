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
        // SELECT query with join to profiles for sender info
        let query = supabase.from('messages')
          .select(`
            id,
            content,
            created_at,
            sender_id, // Keep the raw sender_id for comparison
            receiver_id,
            channel_id,
            profiles(username, avatar_url) // Fetch sender's profile for display
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

        // Map data to ensure senderProfile is always an object, even if null from DB
        const messagesWithSenderInfo = data.map(msg => ({
            ...msg,
            senderProfile: msg.profiles || { username: 'Unknown', avatar_url: null } // Ensure senderProfile is an object
        }));
        setMessages(messagesWithSenderInfo);
        console.log('ChatWindow: Fetched messages (with sender profiles):', messagesWithSenderInfo);
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
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
          // For Realtime: fetch the sender's profile specifically for the new message
          const { data: senderProfileData, error: profileError } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', newMessagePayload.sender_id)
            .single();

          const senderProfile = senderProfileData || { username: 'Unknown', avatar_url: null };

          setMessages((prevMessages) => {
            // Check if message already exists (e.g., from optimistic update)
            if (prevMessages.find(msg => msg.id === newMessagePayload.id)) {
                return prevMessages.map(msg =>
                    msg.id === newMessagePayload.id
                        ? { ...newMessagePayload, senderProfile, is_optimistic: false } // Update optimistic with full data
                        : msg
                );
            }
            // Add new message with fetched sender profile
            return [...prevMessages, { ...newMessagePayload, senderProfile }];
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
      sender_id: currentUser.id, // Store raw ID for comparison in DB insertion
      senderProfile: { // Mock profile for immediate UI update
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
        sender_id: currentUser.id,
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
      // No need to update messages state here if Realtime listener is fast enough.
      // The Realtime listener should now correctly add the message with senderProfile.
      // If needed for slower Realtime, ensure mapping replaces optimistic and adds senderProfile.
      // For now, let Realtime be the source of truth after optimistic.

    } catch (err) {
      console.error('ChatWindow: Caught error in handleSendMessage:', err.message);
      setError(`Failed to send message: ${err.message}`);
      // Revert optimistic message if send fails
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
              msg.sender_id === currentUser.id ? styles.sent : styles.received
            } ${msg.is_optimistic ? styles.optimisticMessage : ''}`}
          >
            {/* Display sender's username ONLY for received messages in channels */}
            {isChannel && msg.sender_id !== currentUser.id && (
              <div className={styles.messageSenderInfo}>
                <img
                  src={msg.senderProfile?.avatar_url || `https://placehold.co/24x24/40444B/FFFFFF?text=${msg.senderProfile?.username ? msg.senderProfile.username[0].toUpperCase() : '?'}`}
                  alt={`${msg.senderProfile?.username || 'Unknown'}'s Avatar`}
                  className={styles.messageSenderAvatar}
                />
                <span className={styles.messageSenderUsername}>{msg.senderProfile?.username || 'Unknown User'}</span>
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
