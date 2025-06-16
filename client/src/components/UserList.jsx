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
  const activeChannelRef = useRef(null);

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

  // Effect for Supabase Realtime Presence Setup
  useEffect(() => {
    // If no authenticated user, clean up any existing channel and return
    if (!supabase || !currentUser?.id) {
      console.log('UserList: No current user ID or supabase client. Cleaning up any existing channel and returning.');
      const existingChannel = supabase.getChannel('online_users'); // Attempt to get a channel by name for cleanup
      if (existingChannel) {
        console.log('UserList: Found existing "online_users" channel during cleanup (no current user).');
        try {
          existingChannel.untrack();
          existingChannel.unsubscribe();
          supabase.removeChannel(existingChannel);
          console.log('UserList: Cleaned up existing channel due to no current user.');
        } catch (err) {
          console.error('UserList: Error cleaning up existing channel:', err.message);
        }
      }
      // Also clean up the ref if it was pointing to something
      activeChannelRef.current = null;
      return;
    }

    // IMPORTANT: If we're here, it means currentUser?.id IS valid.
    // We should ensure only ONE channel is ever actively subscribed for this user.
    // Supabase client manages channels by name. If a channel already exists with this name,
    // subsequent `supabase.channel('name')` calls will return the *same instance*.
    // We need to ensure it's subscribed and tracked appropriately.

    // Get the channel instance. If it doesn't exist, create it.
    let channel = supabase.getChannel('online_users');
    if (!channel) {
      console.log('UserList: No existing "online_users" channel found. Creating new one.');
      channel = supabase.channel('online_users', {
        config: {
          presence: {
            key: currentUser.id,
          },
        },
      });
      activeChannelRef.current = channel; // Store the new instance

      // Set up listeners ONLY when the channel is first created/initialized in this useEffect flow
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
        });

      // Subscribe the channel
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('UserList: Realtime channel SUBSCRIBED successfully. Announcing presence...');
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
        } else {
          console.log('UserList: Realtime channel subscription status:', status);
        }
      });

      // Also listen for general Realtime disconnection
      supabase.realtime.onDisconnected(() => {
        console.warn('UserList: Supabase Realtime client DISCONNECTED! All users should be considered offline.');
        setUsers(prevUsers => prevUsers.map(u => ({ ...u, status: 'Offline' })));
      });

    } else {
      // If channel already existed (getChannel returned it) and this effect ran,
      // it means the user's ID (key) should be tracked already.
      // Re-track only if it seems necessary, but primarily rely on existing subscription.
      console.log('UserList: Channel already exists and user is potentially tracked. Re-verifying tracking status.');
      // This path is tricky, ensure it doesn't cause re-subscribes
      // We assume if it exists via getChannel, it's either subscribed or in connecting state.
      // Explicitly track again if its state implies it might not be.
      if (channel.subscription && channel.subscription.state !== 'SUBSCRIBED') {
          console.log('UserList: Existing channel not SUBSCRIBED, attempting to subscribe/track.');
          channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              console.log('UserList: Re-subscribed existing channel successfully.');
              const { error: trackError } = await channel.track({
                user_id: currentUser.id,
                username: currentUser.user_metadata?.username || currentUser.email,
                status: 'Online',
              });
              if (trackError) console.error('UserList: Error re-tracking presence:', trackError.message);
              else console.log('UserList: Presence re-tracked successfully.');
            } else if (status === 'CHANNEL_ERROR') {
              console.error('UserList: Re-subscribe existing channel error. Status:', status);
            }
          });
      } else if (channel.subscription && channel.subscription.state === 'SUBSCRIBED') {
         console.log('UserList: Channel already subscribed. Ensuring presence is still tracked.');
         // Optionally, force re-track if you suspect presence dropped without a leave event
         // channel.track(...) - but this can lead to "duplicate key" errors if not careful.
         // Better to rely on auto-reconnect or the sync event.
      }
    }


    // Cleanup function for this useEffect: runs when dependencies change or component unmounts
    return () => {
      console.log('UserList: useEffect RETURN cleanup function triggered for user:', currentUser?.id);
      // Get the channel instance specific to this UserList component's lifecycle
      const cleanupChannel = supabase.getChannel('online_users'); // Get it one last time for cleanup
      if (cleanupChannel) {
        console.log('UserList: Untracking and unsubscribing presence channel on useEffect cleanup.');
        try {
          cleanupChannel.untrack(); // Signal leave presence
          cleanupChannel.unsubscribe(); // Unsubscribe from the channel
          supabase.removeChannel(cleanupChannel); // Remove from Supabase client's internal list
          console.log('UserList: Realtime channel fully cleaned up by useEffect return.');
        } catch (err) {
          console.error('UserList: Error during untrack/unsubscribe in useEffect cleanup:', err.message);
        }
      }
      activeChannelRef.current = null; // Clear ref after cleanup
    };
  }, [supabase, currentUser?.id]); // Dependencies: supabase and stable ID of currentUser

  // --- Separate useEffect for global window.beforeunload event ---
  useEffect(() => {
    const handleGlobalBeforeUnload = () => {
      const channelToUntrack = supabase.getChannel('online_users'); // Get it globally

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
