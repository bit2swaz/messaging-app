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
        setUsers(data || []);
      } catch (err) {
        console.error('UserList: Error fetching all profiles:', err.message);
        setError('Failed to load user list.');
        setUsers([]);
      }
    };

    fetchAllProfiles();
  }, [supabase, currentUser]);

  // Effect for Supabase Realtime Presence Setup - Simplified and corrected
  useEffect(() => {
    // Only proceed if supabase client and current user are available
    if (!supabase || !currentUser) {
      console.log('UserList: No current user or supabase client. Skipping presence subscription.');
      return;
    }

    console.log('UserList: Setting up presence channel for user:', currentUser.id);
    const channel = supabase.channel('online_users', {
      config: {
        presence: {
          key: currentUser.id, // Unique key for the current user in this channel
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        const onlineUserIds = Object.keys(presenceState); // Keys are the user IDs

        setUsers(prevUsers => {
          // Map over all users and update their status based on onlineUserIds
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

    // --- Cleanup function for this useEffect ---
    // This runs when the component unmounts OR when currentUser changes (causing a re-run of this effect)
    return () => {
      console.log('UserList: useEffect cleanup - Cleaning up presence for user:', currentUser?.id);
      // Ensure we have a channel to untrack/unsubscribe
      if (channel && channel.subscription.state === 'SUBSCRIBED') {
        console.log('UserList: Untracking and unsubscribing presence channel on cleanup.');
        try {
          channel.untrack();
          channel.unsubscribe();
          supabase.removeChannel(channel);
        } catch (err) {
          console.error('UserList: Error during untrack/unsubscribe in cleanup:', err.message);
        }
      }
    };
  }, [supabase, currentUser]); // Dependencies: Re-subscribe if supabase or current user changes

  // --- Browser unload event listener (outside of the main presence useEffect) ---
  // This needs to be a separate effect or handled carefully if it was still causing issues.
  // Given the current problem, we will re-integrate it, but ensure it only sets up once.
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Access the channel directly or via supabase.getChannel if needed
      // Find the channel instance you care about
      const channelToUntrack = supabase.getChannel('online_users'); // Get by name

      if (channelToUntrack && channelToUntrack.subscription.state === 'SUBSCRIBED') {
        console.log('UserList: Before unload event - Untracking and unsubscribing from presence.');
        try {
          channelToUntrack.untrack();
          channelToUntrack.unsubscribe();
          supabase.removeChannel(channelToUntrack);
        } catch (err) {
          console.error('UserList: Error during untrack/unsubscribe on beforeunload:', err.message);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      console.log('UserList: Before unload listener removed.');
    };
  }, [supabase]); // Depend only on supabase to attach listener once per supabase client instance

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
