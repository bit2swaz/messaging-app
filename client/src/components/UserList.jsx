// client/src/components/UserList.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import styles from './UserList.module.css'; // CSS Module for this component

const UserList = () => {
  const { supabase, user: currentUser } = useAuth(); // Get supabase client and current logged-in user
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase || !currentUser) {
      return; // Wait for supabase client and current user to be available
    }

    const fetchUsers = async () => {
      try {
        // Fetch all user profiles except the current user's
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, status')
          .neq('id', currentUser.id); // Exclude the current user

        if (error) {
          throw error;
        }

        setUsers(data);
        console.log('UserList: Fetched initial users:', data.map(u => u.username));
      } catch (err) {
        console.error('UserList: Error fetching users:', err.message);
        setError('Failed to load users.');
      }
    };

    fetchUsers();

    // --- Supabase Realtime Presence Setup ---
    // Join a presence channel. We'll use a generic 'online_users' channel
    // and send the current user's ID and status when they come online.
    const channel = supabase.channel('online_users', {
      config: {
        presence: {
          key: currentUser.id, // Unique key for the current user in this channel
        },
      },
    });

    // Subscribe to presence changes
    channel
      .on('presence', { event: 'sync' }, () => {
        // 'sync' event fires initially and when presence state changes
        const presenceState = channel.presenceState();
        console.log('UserList: Presence sync event. State:', presenceState);

        const onlineUserIds = Object.keys(presenceState).map(key => key);
        console.log('UserList: Online user IDs:', onlineUserIds);

        setUsers(prevUsers => {
          return prevUsers.map(u => {
            // Determine if the user is currently online based on presenceState
            const isOnline = onlineUserIds.includes(u.id);
            return {
              ...u,
              // Update status based on presence. If previously 'Offline' and now detected, set 'Online'
              status: isOnline ? 'Online' : 'Offline',
            };
          });
        });
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('UserList: User(s) JOINED presence:', newPresences);
        // On join, immediately update the status of the joined users
        setUsers(prevUsers => {
          return prevUsers.map(u => {
            const joinedUser = newPresences.find(p => p.key === u.id);
            return {
              ...u,
              status: joinedUser ? 'Online' : u.status,
            };
          });
        });
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('UserList: User(s) LEFT presence:', leftPresences);
        // On leave, immediately set the status of left users to 'Offline'
        setUsers(prevUsers => {
          return prevUsers.map(u => {
            const leftUser = leftPresences.find(p => p.key === u.id);
            return {
              ...u,
              status: leftUser ? 'Offline' : u.status,
            };
          });
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Announce presence when subscribed
          console.log('UserList: Presence channel SUBSCRIBED. Announcing presence...');
          const { error: trackError } = await channel.track({
            user_id: currentUser.id,
            username: currentUser.user_metadata?.username || currentUser.email,
            status: 'Online', // Initial status when joining
          });
          if (trackError) {
            console.error('UserList: Error tracking presence:', trackError.message);
          }
        }
      });

    // Cleanup: Remove presence when component unmounts and unsubscribe from channel
    return () => {
      console.log('UserList: Cleaning up presence listener and removing self from presence.');
      channel.untrack(); // Remove user from presence state
      channel.unsubscribe(); // Unsubscribe from the channel
    };

  }, [supabase, currentUser]); // Re-run effect if supabase client or currentUser changes

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <div className={styles.userListContainer}>
      <h3 className={styles.listHeader}>Online Users</h3>
      <ul className={styles.userList}>
        {users.filter(u => u.status === 'Online').map(user => (
          <li key={user.id} className={styles.userListItem}>
            <img
              src={user.avatar_url || `https://placehold.co/24x24/3BA55D/FFFFFF?text=${user.username ? user.username[0].toUpperCase() : '?'}`}
              alt={`${user.username}'s Avatar`}
              className={styles.userAvatar}
            />
            <span className={styles.username}>{user.username}</span>
            <span className={styles.statusIndicatorOnline}></span> {/* Green dot */}
          </li>
        ))}
        <h3 className={styles.listHeader}>Offline Users</h3>
        {users.filter(u => u.status === 'Offline').map(user => (
          <li key={user.id} className={styles.userListItem}>
            <img
              src={user.avatar_url || `https://placehold.co/24x24/72767D/FFFFFF?text=${user.username ? user.username[0].toUpperCase() : '?'}`}
              alt={`${user.username}'s Avatar`}
              className={styles.userAvatar}
            />
            <span className={styles.username}>{user.username}</span>
            <span className={styles.statusIndicatorOffline}></span> {/* Grey dot */}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default UserList;
