// client/src/components/UserList.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import { useAuth } from '../context/AuthContext';
import styles from './UserList.module.css';

const UserList = () => {
  const { supabase, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const navigate = useNavigate(); // Initialize useNavigate

  useEffect(() => {
    if (!supabase || !currentUser) {
      return;
    }

    const fetchUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, status')
          .neq('id', currentUser.id);

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
        const onlineUserIds = Object.values(presenceState).flat().map(p => p.user_id); // Get user_id from tracked data

        setUsers(prevUsers => {
          return prevUsers.map(u => ({
            ...u,
            status: onlineUserIds.includes(u.id) ? 'Online' : 'Offline',
          }));
        });
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('UserList: User(s) JOINED presence:', newPresences);
        setUsers(prevUsers => {
          return prevUsers.map(u => {
            const joinedUser = newPresences.find(p => p.key === u.id); // 'key' is the user.id we tracked
            return {
              ...u,
              status: joinedUser ? 'Online' : u.status,
            };
          });
        });
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('UserList: User(s) LEFT presence:', leftPresences);
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
          console.log('UserList: Presence channel SUBSCRIBED. Announcing presence...');
          const { error: trackError } = await channel.track({
            user_id: currentUser.id, // Ensure we track user_id here for easy lookup
            username: currentUser.user_metadata?.username || currentUser.email,
            status: 'Online',
          });
          if (trackError) {
            console.error('UserList: Error tracking presence:', trackError.message);
          }
        }
      });

    return () => {
      console.log('UserList: Cleaning up presence listener and removing self from presence.');
      channel.untrack();
      channel.unsubscribe();
    };

  }, [supabase, currentUser]);

  const handleUserClick = (userId) => {
    navigate(`/home/chat/${userId}`); // Navigate to the chat window for the selected user
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
