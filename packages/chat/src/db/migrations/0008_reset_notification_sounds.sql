-- Reset all notification sounds to 'default' for the new semantic sound system
-- Old values (glass, ping, pop, etc.) are replaced with the new semantic ID 'default'
UPDATE user_settings
SET value = '"default"'
WHERE key = 'notificationSound';
