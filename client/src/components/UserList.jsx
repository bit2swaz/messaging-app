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

  // Ref to hold the active presence channel instance for cleanup
  const activePresenceChannelRef = useRef(null);

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

  // Effect for Supabase Realtime Presence Setup and Cleanup
  useEffect(() => {
    // 1. Clean up any previous channel first if this effect re-runs
    if (activePresenceChannelRef.current) {
      console.log('UserList: useEffect cleanup from previous run. Untracking & unsubscribing old channel.');
      try {
        activePresenceChannelRef.current.untrack();
        activePresenceChannelRef.current.unsubscribe();
        supabase.removeChannel(activePresenceChannelRef.current);
      } catch (err) {
        console.error('UserList: Error during old channel cleanup:', err.message);
      } finally {
        activePresenceChannelRef.current = null;
      }
    }

    // 2. If no current user, we are done with presence for now.
    if (!supabase || !currentUser) {
      console.log('UserList: No current user or supabase client. Skipping new presence subscription.');
      return;
    }

    // 3. Setup new channel
    console.log('UserList: Setting up NEW presence channel for user:', currentUser.id);
    const channel = supabase.channel('online_users', {
      config: {
        presence: {
          key: currentUser.id, // Unique key for the current user in this channel
        },
      },
    });

    activePresenceChannelRef.current = channel; // Store this new channel instance

    channel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        const onlineUserIds = Object.keys(presenceState);

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

    // Final cleanup function for THIS specific useEffect run
    return () => {
      console.log('UserList: useEffect RETURN cleanup for user:', currentUser?.id);
      // This is the primary unsubscription mechanism for normal React lifecycle
      if (channel && channel.subscription.state === 'SUBSCRIBED') { // Safe check
        console.log('UserList: Untracking and unsubscribing presence channel on useEffect cleanup.');
        try {
          channel.untrack();
          channel.unsubscribe();
          supabase.removeChannel(channel);
        } catch (err) {
          console.error('UserList: Error during untrack/unsubscribe in useEffect cleanup:', err.message);
        }
      }
    };
  }, [supabase, currentUser]); // Dependencies: Re-subscribe if supabase or current user changes

  // --- Separate useEffect for global window.beforeunload event ---
  useEffect(() => {
    const handleGlobalBeforeUnload = () => {
      // This is a last-ditch effort for abrupt browser closures.
      // It accesses the channel by name as 'channel' from outer scope might be stale.
      const channelToUntrack = supabase.getChannel('online_users');

      if (channelToUntrack && channelToUntrack.subscription.state === 'SUBSCRIBED') { // Safe check
        console.log('UserList: Global beforeunload event - Untracking and unsubscribing from presence.');
        try {
          channelToUntrack.untrack();
          channelToUntrack.unsubscribe();
          supabase.removeChannel(channelToUntrack);
        } catch (err) {
          console.error('UserList: Error during untrack/unsubscribe on global beforeunload:', err.message);
        }
      }
    };

    window.addEventListener('beforeunload', handleGlobalBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleGlobalBeforeUnload);
      console.log('UserList: Global beforeunload listener removed.');
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
