-- app_role enum is missing 'booking_dispatcher', used throughout src/lib (role-policy, data, role-labels).
alter type app_role add value if not exists 'booking_dispatcher';
