// client/src/components/ChatWindow.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './ChatWindow.module.css';

const ChatWindow = () => {
  const { userId } = useParams();
  const { user: currentUser, supabase } = useAuth();

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatPartner, setChatPartner] = useState(null);
  const [error, setError] = useState(null);
  const [tempMessageError, setTempMessageError] = useState(null);
  const messagesEndRef = useRef(null);

  const isDM = !!userId;

  useEffect(() => {
    const fetchChatPartnerDetails = async () => {
      if (!supabase || !userId) {
        setChatPartner(null);
        return;
      }
      setError(null);
      try {
        console.log('ChatWindow: Fetching DM recipient profile:', userId);
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .eq('id', userId)
          .single();
        if (error) throw error;
        setChatPartner({ type: 'user', ...data });
        console.log('ChatWindow: DM recipient profile fetched:', data.username);
      } catch (err) {
        console.error('ChatWindow: Error fetching chat partner details:', err.message);
        setError(`Failed to load chat: ${err.message}`);
        setChatPartner(null);
      }
    };
    fetchChatPartnerDetails();
  }, [supabase, userId]);

  useEffect(() => {
    if (!supabase || !currentUser || !isDM) return;
    setError(null);

    const fetchMessages = async () => {
      try {
        let query = supabase.from('messages')
          .select(`
            id,
            content,
            created_at,
            sender_id,
            receiver_id,
            channel_id,
            profiles!messages_sender_id_fkey(username, avatar_url)
          `)
          .order('created_at', { ascending: true });

        query = query.or(
          `and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId}),` +
          `and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id})`
        );
        query = query.is('channel_id', null);
        console.log(`ChatWindow: Fetching DM messages for ${currentUser.id} and ${userId}`);

        const { data, error } = await query;
        if (error) throw error;

        const messagesWithSenderInfo = data.map(msg => ({
            ...msg,
            senderProfile: msg.profiles || { username: 'Unknown', avatar_url: null }
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

    const realtimeChannelName = `dm_${[currentUser.id, userId].sort().join('_')}`;

    console.log(`ChatWindow: Subscribing to Realtime channel: ${realtimeChannelName}`);
    const channel = supabase
      .channel(realtimeChannelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const newMessagePayload = payload.new;
        let isRelevant = false;

        isRelevant =
          ((newMessagePayload.sender_id === currentUser.id && newMessagePayload.receiver_id === userId) ||
          (newMessagePayload.sender_id === userId && newMessagePayload.receiver_id === currentUser.id)) &&
          newMessagePayload.channel_id === null;

        if (isRelevant) {
          const { data: senderProfileData, error: profileError } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', newMessagePayload.sender_id)
            .single();

          const senderProfile = senderProfileData || { username: 'Unknown', avatar_url: null };

          setMessages((prevMessages) => {
            if (prevMessages.find(msg => msg.id === newMessagePayload.id)) {
                return prevMessages.map(msg =>
                    msg.id === newMessagePayload.id
                        ? { ...newMessagePayload, senderProfile, is_optimistic: false }
                        : msg
                );
            }
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
  }, [supabase, currentUser, userId, isDM]);

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
    if (!currentUser || !isDM || !chatPartner?.id) {
      setTempMessageError('User or chat partner not defined. Please refresh.');
      return;
    }

    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimisticMessage = {
      id: tempId,
      sender_id: currentUser.id,
      senderProfile: {
        username: currentUser.user_metadata?.username || currentUser.email,
        avatar_url: currentUser.user_metadata?.avatar_url
      },
      content: newMessage.trim(),
      created_at: new Date().toISOString(),
      is_optimistic: true,
      receiver_id: userId,
      channel_id: null,
    };

    setMessages((prevMessages) => [...prevMessages, optimisticMessage]);
    setNewMessage('');

    try {
      const messageToInsert = {
        sender_id: currentUser.id,
        content: optimisticMessage.content,
        receiver_id: userId,
        channel_id: null,
      };

      // --- DEBUG LOG HERE ---
      console.log('ChatWindow: Attempting to insert message with:', JSON.stringify(messageToInsert, null, 2));
      console.log('ChatWindow: Current User ID (auth.uid()):', currentUser.id);
      console.log('ChatWindow: Chat Partner User ID (target receiver_id):', userId);
      // --- END DEBUG LOG ---


      const { data, error } = await supabase
        .from('messages')
        .insert([messageToInsert])
        .select();

      if (error) {
        throw error;
      }
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

  const chatHeaderName = chatPartner.username;
  const chatHeaderAvatar = chatPartner.avatar_url || `https://placehold.co/40x40/5865F2/FFFFFF?text=${chatPartner.username ? chatPartner.username[0].toUpperCase() : '?'}`;

  const chatPlaceholder = `Message @${chatHeaderName}...`;

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
