// client/src/components/UserList.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react'; // Add useCallback
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './UserList.module.css';

const UserList = () => {
  const { supabase, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Effect to fetch all user profiles initially
  // This effect needs to run when currentUser changes to update the list,
  // but it's separate from presence.
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
  }, [supabase, currentUser]); // Re-run when Supabase client or currentUser object changes

  // Use a ref to store the channel instance, but manage subscription/unsubscription
  // purely based on currentUser.id (a primitive, less prone to reference changes)
  // and the lifetime of the component.
  const channelInstanceRef = useRef(null);

  // Memoize cleanup function to prevent it changing on every render
  const cleanupPresence = useCallback(() => {
    if (channelInstanceRef.current) {
      console.log('UserList: Performing explicit cleanup of presence channel.');
      try {
        channelInstanceRef.current.untrack();
        channelInstanceRef.current.unsubscribe();
        supabase.removeChannel(channelInstanceRef.current);
      } catch (err) {
        console.error('UserList: Error during explicit presence cleanup:', err.message);
      } finally {
        channelInstanceRef.current = null;
      }
    }
  }, [supabase]); // Depends on supabase to get the correct client instance

  // Effect for Supabase Realtime Presence Setup and Cleanup
  useEffect(() => {
    // If we have an existing channel, clean it up before proceeding to potentially subscribe to a new one
    // This handles component re-renders where dependencies might be considered 'changed' by React
    cleanupPresence(); // Call memoized cleanup

    // Only proceed if supabase client and current user ID are available
    if (!supabase || !currentUser?.id) { // Use currentUser.id for stable check
      console.log('UserList: No current user ID or supabase client. Skipping new presence subscription.');
      return;
    }

    console.log('UserList: Setting up NEW presence channel for user:', currentUser.id);
    const channel = supabase.channel('online_users', {
      config: {
        presence: {
          key: currentUser.id, // Unique key for the current user in this channel
        },
      },
    });

    channelInstanceRef.current = channel; // Store the new channel instance

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

    // The cleanup function for THIS specific useEffect run.
    // This will always run when the component unmounts or if currentUser.id changes.
    return () => {
      console.log('UserList: useEffect RETURN cleanup triggered for current effect.');
      // The memoized cleanup will handle the actual untrack/unsubscribe
      cleanupPresence();
    };
  }, [supabase, currentUser?.id, cleanupPresence]); // Dependencies: supabase, and the stable ID of currentUser, and the memoized cleanup func

  // --- Separate useEffect for global window.beforeunload event ---
  useEffect(() => {
    const handleGlobalBeforeUnload = () => {
      const channelToUntrack = supabase.getChannel('online_users');

      // More robust check for channel existence and attempt cleanup
      if (channelToUntrack) {
        console.log('UserList: Global beforeunload event - Attempting untrack/unsubscribe.');
        try {
          channelToUntrack.untrack();
          channelToUntrack.unsubscribe();
          supabase.removeChannel(channelToUntrack);
        } catch (err) {
          console.error('UserList: Error during untrack/unsubscribe on global beforeunload:', err.message);
        }
      } else {
        console.log('UserList: Global beforeunload - No active channel to untrack.');
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
