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
          // Temporarily removing 'status' from select, as Realtime presence is disabled
          .select('id, username, avatar_url')
          .neq('id', currentUser.id);

        if (error) {
          throw error;
        }
        // For now, all users are treated as 'Offline' since Realtime presence is disabled
        setUsers(data ? data.map(u => ({ ...u, status: 'Offline' })) : []);
        console.log('UserList: Fetched profiles successfully:', data.map(u => u.username));
      } catch (err) {
        console.error('UserList: Error fetching all profiles:', err.message);
        setError('Failed to load user list.');
        setUsers([]);
      }
    };

    fetchAllProfiles();
  }, [supabase, currentUser]);

  // TEMPORARILY COMMENTING OUT THE ENTIRE REALTIME PRESENCE EFFECT
  // We will re-enable and fix this once the core UI/UX is stable.
  /*
  useEffect(() => {
    // If no authenticated user, clean up any existing channel and return
    if (!supabase || !currentUser?.id) {
      console.log('UserList: No current user ID or supabase client. Cleaning up any existing channel and returning.');
      const existingChannel = supabase.getChannel('online_users');
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
      return;
    }

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

      supabase.realtime.onDisconnected(() => {
        console.warn('UserList: Supabase Realtime client DISCONNECTED! All users should be considered offline.');
        setUsers(prevUsers => prevUsers.map(u => ({ ...u, status: 'Offline' })));
      });

    } else {
      console.log('UserList: Channel already exists and user is potentially tracked. Re-verifying tracking status.');
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
      }
    }

    return () => {
      console.log('UserList: useEffect RETURN cleanup function triggered for user:', currentUser?.id);
      const cleanupChannel = supabase.getChannel('online_users');
      if (cleanupChannel) {
        console.log('UserList: Untracking and unsubscribing presence channel on useEffect cleanup.');
        try {
          cleanupChannel.untrack();
          cleanupChannel.unsubscribe();
          supabase.removeChannel(cleanupChannel);
          console.log('UserList: Realtime channel fully cleaned up by useEffect return.');
        } catch (err) {
          console.error('UserList: Error during untrack/unsubscribe in useEffect cleanup:', err.message);
        }
      }
    };
  }, [supabase, currentUser?.id]);
  */

  // --- TEMPORARILY COMMENTING OUT global window.beforeunload event listener ---
  /*
  useEffect(() => {
    const handleGlobalBeforeUnload = () => {
      const channelToUntrack = supabase.getChannel('online_users');

      if (channelToUntrack) {
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
  }, [supabase]);
  */

  const handleUserClick = (userId) => {
    navigate(`/home/chat/${userId}`);
  };

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <div className={styles.userListContainer}>
      {/* Displaying users under 'Offline Users' as presence is disabled */}
      <h3 className={styles.listHeader}>Users</h3>
      <ul className={styles.userList}>
        {users.map(user => ( // No more filtering by status since it's all 'Offline'
          <li key={user.id} className={styles.userListItem} onClick={() => handleUserClick(user.id)}>
            <img
              src={user.avatar_url || `https://placehold.co/24x24/72767D/FFFFFF?text=${user.username ? user.username[0].toUpperCase() : '?'}`}
              alt={`${user.username}'s Avatar`}
              className={styles.userAvatar}
            />
            <span className={styles.username}>{user.username}</span>
            {/* Temporarily remove status indicator as presence is disabled */}
            {/* <span className={user.status === 'Online' ? styles.statusIndicatorOnline : styles.statusIndicatorOffline}></span> */}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default UserList;