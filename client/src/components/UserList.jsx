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
        setUsers([]);
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

  // Effect for Supabase Realtime Presence Setup - Simplified to bare essentials
  useEffect(() => {
    // If no authenticated user, or no supabase client, return.
    // The cleanup will happen when currentUser becomes null or component unmounts.
    if (!supabase || !currentUser?.id) {
      console.log('UserList: No current user ID or supabase client. Realtime subscription skipped.');
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

    // Cleanup function for this useEffect: runs when dependencies change or component unmounts
    return () => {
      console.log('UserList: useEffect RETURN cleanup function triggered for user:', currentUser?.id);
      if (channel) {
        console.log('UserList: Untracking and unsubscribing presence channel on useEffect cleanup.');
        try {
          channel.untrack(); // Signal leave presence
          channel.unsubscribe(); // Unsubscribe from the channel
          supabase.removeChannel(channel); // Remove from Supabase client's internal list
          console.log('UserList: Realtime channel fully cleaned up by useEffect return.');
        } catch (err) {
          console.error('UserList: Error during untrack/unsubscribe in useEffect cleanup:', err.message);
        }
      }
    };
  }, [supabase, currentUser?.id]); // Dependencies: supabase and stable ID of currentUser

  // --- Removed global window.beforeunload event listener for now ---
  // We will ONLY re-add this if the basic logout works reliably.

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
