// client/src/components/UserList.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './UserList.module.css';

const UserList = () => {
  const { supabase, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Keep track of the presence channel instance
  const presenceChannelRef = useRef(null);

  // Effect to fetch all user profiles initially
  useEffect(() => {
    const fetchAllProfiles = async () => {
      if (!supabase || !currentUser) {
        setUsers([]); // Clear users if not logged in
        return;
      }
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, status')
          .neq('id', currentUser.id); // Exclude the current user

        if (error) {
          throw error;
        }
        setUsers(data || []); // Ensure data is an array
      } catch (err) {
        console.error('UserList: Error fetching all profiles:', err.message);
        setError('Failed to load user list.');
        setUsers([]);
      }
    };

    fetchAllProfiles();
  }, [supabase, currentUser]); // Re-run if supabase client or currentUser changes

  // Effect for Supabase Realtime Presence Setup
  useEffect(() => {
    if (!supabase || !currentUser) {
      // If not logged in, ensure we clean up any old channel and don't proceed
      if (presenceChannelRef.current) {
        console.log('UserList: User logged out/not present, unsubscribing from presence channel.');
        presenceChannelRef.current.untrack();
        presenceChannelRef.current.unsubscribe();
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }
      return; // Stop here if no current user
    }

    // Ensure only one channel is subscribed at a time
    if (presenceChannelRef.current) {
      console.log('UserList: Existing presence channel found, unsubscribing before re-subscribing.');
      presenceChannelRef.current.untrack();
      presenceChannelRef.current.unsubscribe();
      supabase.removeChannel(presenceChannelRef.current);
      presenceChannelRef.current = null;
    }

    console.log('UserList: Subscribing to presence channel for user:', currentUser.id);
    const channel = supabase.channel('online_users', {
      config: {
        presence: {
          key: currentUser.id, // Unique key for the current user in this channel
        },
      },
    });

    presenceChannelRef.current = channel; // Store channel instance

    channel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        const onlineUserIds = Object.keys(presenceState); // Keys are the user IDs

        setUsers(prevUsers => {
          return prevUsers.map(u => ({
            ...u,
            status: onlineUserIds.includes(u.id) ? 'Online' : 'Offline',
          }));
        });
        console.log('UserList: Presence sync completed. Online IDs:', onlineUserIds);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('UserList: User(s) JOINED presence:', newPresences.map(p => p.key));
        setUsers(prevUsers => {
          return prevUsers.map(u => {
            const isJoined = newPresences.some(p => p.key === u.id);
            return {
              ...u,
              status: isJoined ? 'Online' : u.status,
            };
          });
        });
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('UserList: User(s) LEFT presence:', leftPresences.map(p => p.key));
        setUsers(prevUsers => {
          return prevUsers.map(u => {
            const isLeft = leftPresences.some(p => p.key === u.id);
            return {
              ...u,
              status: isLeft ? 'Offline' : u.status,
            };
          });
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('UserList: Presence channel SUBSCRIBED. Announcing presence...');
          const { error: trackError } = await channel.track({
            user_id: currentUser.id,
            username: currentUser.user_metadata?.username || currentUser.email,
            status: 'Online',
          });
          if (trackError) {
            console.error('UserList: Error tracking presence:', trackError.message);
          }
        }
      });

    // --- Critical part: Handle browser tab closing/unloading ---
    const handleBeforeUnload = () => {
      if (channel && channel.subscription.state === 'SUBSCRIBED') {
        console.log('UserList: Before unload event - Untracking and unsubscribing from presence.');
        // Use synchronous un-track if possible, or send a small beacon.
        // For Supabase, untrack() and unsubscribe() are generally async but will send the message before browser fully closes.
        try {
          channel.untrack();
          channel.unsubscribe();
          supabase.removeChannel(channel);
          console.log('UserList: Successfully untracked/unsubscribed on beforeunload.');
        } catch (err) {
          console.error('UserList: Error during untrack/unsubscribe on beforeunload:', err.message);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup: This runs when useEffect re-runs or component unmounts normally
    return () => {
      console.log('UserList: useEffect cleanup - Running cleanup for presence.');
      if (presenceChannelRef.current) {
        console.log('UserList: useEffect cleanup - Untracking and unsubscribing presence channel.');
        presenceChannelRef.current.untrack();
        presenceChannelRef.current.unsubscribe();
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }
      // Remove the global event listener
      window.removeEventListener('beforeunload', handleBeforeUnload);
      console.log('UserList: Before unload listener removed.');
    };
  }, [supabase, currentUser]); // Key: This re-runs when currentUser changes (e.g., login/logout)

  const handleUserClick = (userId) => {
    navigate(`/home/chat/${userId}`);
  };

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <div className={styles.userListContainer}>
      <h3 className={styles.listHeader}>Online Users</h3>
      <ul className={styles.userList}>
        {users.filter(u => u.status === 'Online').map(user => (
          <li key={user.id} className={styles.userListItem} onClick={() => handleUserClick(user.id)}>
            <img
              src={user.avatar_url || `https://placehold.co/24x24/3BA55D/FFFFFF?text=${user.username ? user.username[0].toUpperCase() : '?'}`}
              alt={`${user.username}'s Avatar`}
              className={styles.userAvatar}
            />
            <span className={styles.username}>{user.username}</span>
            <span className={styles.statusIndicatorOnline}></span>
          </li>
        ))}
        <h3 className={styles.listHeader}>Offline Users</h3>
        {users.filter(u => u.status === 'Offline').map(user => (
          <li key={user.id} className={styles.userListItem} onClick={() => handleUserClick(user.id)}>
            <img
              src={user.avatar_url || `https://placehold.co/24x24/72767D/FFFFFF?text=${user.username ? user.username[0].toUpperCase() : '?'}`}
              alt={`${user.username}'s Avatar`}
              className={styles.userAvatar}
            />
            <span className={styles.username}>{user.username}</span>
            <span className={styles.statusIndicatorOffline}></span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default UserList;
