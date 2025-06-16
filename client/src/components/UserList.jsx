// client/src/components/UserList.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  // Ref to track if subscription has been successfully established for current user
  const isSubscribedRef = useRef(false);

  // Effect to fetch all user profiles initially
  useEffect(() => {
    const fetchAllProfiles = async () => {
      if (!supabase || !currentUser) {
        console.log('UserList: Fetching profiles skipped - no supabase or current user.');
        setUsers([]); // Clear users if not logged in
        return;
      }
      try {
        console.log('UserList: Fetching all profiles...');
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, status')
          .neq('id', currentUser.id);

        if (error) {
          throw error;
        }
        setUsers(data || []);
        console.log('UserList: Fetched profiles successfully:', data.map(u => u.username));
      } catch (err) {
        console.error('UserList: Error fetching all profiles:', err.message);
        setError('Failed to load user list.');
        setUsers([]);
      }
    };

    fetchAllProfiles();
  }, [supabase, currentUser]);

  // Memoized function for reliable cleanup of the Realtime channel
  const cleanupRealtimeChannel = useCallback(() => {
    if (activePresenceChannelRef.current) {
      console.log('UserList: Performing explicit cleanup of Realtime channel.');
      try {
        activePresenceChannelRef.current.untrack(); // Signal leave presence
        activePresenceChannelRef.current.unsubscribe(); // Unsubscribe from the channel
        supabase.removeChannel(activePresenceChannelRef.current); // Remove from Supabase client's internal list
        console.log('UserList: Realtime channel untracked, unsubscribed, and removed.');
      } catch (err) {
        console.error('UserList: Error during Realtime channel cleanup:', err.message);
      } finally {
        activePresenceChannelRef.current = null; // Clear ref
        isSubscribedRef.current = false; // Reset subscription flag
      }
    }
  }, [supabase]); // Depends on supabase client instance

  // Effect for Supabase Realtime Presence Setup
  useEffect(() => {
    // 1. Always attempt cleanup on effect re-run (or component unmount via return)
    cleanupRealtimeChannel(); // Clean up any potentially old/existing channel

    // 2. If no current user, or if already subscribed, do not attempt to subscribe again
    if (!supabase || !currentUser?.id) {
      console.log('UserList: No current user ID or supabase client. Realtime subscription skipped.');
      return;
    }

    // NEW CHECK: Only subscribe if we are not already subscribed for this session
    if (isSubscribedRef.current) {
      console.log('UserList: Already subscribed for this session. Skipping new subscription attempt.');
      return;
    }

    console.log('UserList: Attempting to subscribe to Realtime presence channel for user:', currentUser.id);
    const channel = supabase.channel('online_users', {
      config: {
        presence: {
          key: currentUser.id,
        },
      },
    });

    activePresenceChannelRef.current = channel; // Store the new channel instance

    channel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        const onlineUserIds = Object.keys(presenceState);

        console.log('UserList: Presence sync event received.');
        console.log('UserList: Raw presenceState:', JSON.stringify(presenceState, null, 2));
        console.log('UserList: Extracted onlineUserIds:', onlineUserIds);

        setUsers(prevUsers => {
          return prevUsers.map(u => {
            const newStatus = onlineUserIds.includes(u.id) ? 'Online' : 'Offline';
            if (u.status !== newStatus) {
              console.log(`UserList: User ${u.username} (${u.id}) changed status from ${u.status} to ${newStatus}`);
            }
            return {
              ...u,
              status: newStatus,
            };
          });
        });
        console.log('UserList: Users state updated after sync.');
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
          console.log('UserList: Realtime channel SUBSCRIBED successfully. Announcing presence...');
          isSubscribedRef.current = true; // Set flag to true on successful subscription
          const { error: trackError } = await channel.track({
            user_id: currentUser.id,
            username: currentUser.user_metadata?.username || currentUser.email,
            status: 'Online',
          });
          if (trackError) {
            console.error('UserList: Error tracking presence:', trackError.message);
          } else {
            console.log('UserList: Presence tracked successfully for current user.');
          }
        } else if (status === 'CHANNEL_ERROR') {
          console.error('UserList: Realtime channel subscription error. Status:', status);
          isSubscribedRef.current = false; // Reset flag on error
        } else {
          console.log('UserList: Realtime channel subscription status:', status);
        }
      });

    // Cleanup function for this useEffect: runs when dependencies change or component unmounts
    return () => {
      console.log('UserList: useEffect RETURN cleanup function triggered. Calling memoized cleanup.');
      // The memoized cleanup will handle the actual untrack/unsubscribe
      cleanupRealtimeChannel();
    };
  }, [supabase, currentUser?.id, cleanupRealtimeChannel]); // Dependencies: supabase, currentUser.id, and the memoized cleanup func

  // --- Separated useEffect for global window.beforeunload event ---
  useEffect(() => {
    const handleGlobalBeforeUnload = () => {
      // This is a last-ditch effort for abrupt browser closures.
      const channelToUntrack = supabase.getChannel('online_users');

      if (channelToUntrack) { // Just check if channel object exists
        console.log('UserList: Global beforeunload event - Attempting untrack/unsubscribe.');
        try {
          channelToUntrack.untrack();
          channelToUntrack.unsubscribe();
          supabase.removeChannel(channelToUntrack);
          console.log('UserList: Successfully untracked/unsubscribed on global beforeunload.');
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
