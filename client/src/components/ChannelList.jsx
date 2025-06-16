// client/src/components/ChannelList.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './ChannelList.module.css'; // We will create this CSS file next

const ChannelList = () => {
  const { user, supabase } = useAuth();
  const [channels, setChannels] = useState([]);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchChannels = async () => {
      if (!user || !supabase) {
        console.log('ChannelList: User or Supabase client not available, skipping channel fetch.');
        setChannels([]);
        return;
      }

      setError(null); // Clear previous errors

      try {
        // For now, we'll fetch all channels and assume user is part of them.
        // Later, we will use a backend API to fetch only channels the user is a member of.
        console.log('ChannelList: Fetching all channels...');
        const { data, error } = await supabase
          .from('channels')
          .select('id, name, description, created_by'); // Select necessary channel info

        if (error) {
          throw error;
        }

        setChannels(data || []);
        console.log('ChannelList: Fetched channels successfully:', data.map(c => c.name));

      } catch (err) {
        console.error('ChannelList: Error fetching channels:', err.message);
        setError('Failed to load channels.');
        setChannels([]);
      }
    };

    fetchChannels();
  }, [user, supabase]);

  const handleChannelClick = (channelId) => {
    // Navigate to the specific channel's chat window
    navigate(`/home/channel/${channelId}`);
  };

  const handleCreateChannel = () => {
    // For now, this will just log a message.
    // In a later sub-phase, this will open a modal or navigate to a creation form.
    console.log('ChannelList: Create new channel button clicked. (Functionality to be added)');
    // navigate('/home/create-channel'); // Example for future route
  };


  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <div className={styles.channelListContainer}>
      <div className={styles.header}>
        <h3 className={styles.listHeader}>Channels</h3>
        <button onClick={handleCreateChannel} className={styles.createChannelButton}>
          +
        </button>
      </div>
      {channels.length === 0 && !error ? (
        <p className={styles.noChannels}>No channels found. Create one!</p>
      ) : (
        <ul className={styles.channelList}>
          {channels.map(channel => (
            <li key={channel.id} className={styles.channelListItem} onClick={() => handleChannelClick(channel.id)}>
              <span className={styles.channelName}># {channel.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ChannelList;
