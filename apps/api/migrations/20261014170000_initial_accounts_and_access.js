export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE app_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL CHECK (email = btrim(email) AND length(email) <= 320),
      password_hash text NOT NULL CHECK (length(password_hash) BETWEEN 1 AND 255),
      display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX app_users_email_lower_unique
      ON app_users (lower(email));

    CREATE TABLE roles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code text NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_]{1,49}$'),
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE permissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code text NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_.]{1,99}$'),
      description text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE user_roles (
      user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
      assigned_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
      assigned_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, role_id)
    );

    CREATE INDEX user_roles_role_id_idx ON user_roles (role_id);

    CREATE TABLE role_permissions (
      role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE user_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      last_seen_at timestamptz,
      CHECK (expires_at > created_at)
    );

    CREATE INDEX user_sessions_user_expiry_idx
      ON user_sessions (user_id, expires_at);

    CREATE INDEX user_sessions_active_expiry_idx
      ON user_sessions (expires_at)
      WHERE revoked_at IS NULL;

    INSERT INTO roles (code, name)
    VALUES ('admin', 'Admin'), ('staff', 'Staff');

    INSERT INTO permissions (code, description)
    VALUES
      ('students.read', 'View student records'),
      ('students.write', 'Create and edit student records'),
      ('students.export', 'Export student records'),
      ('applications.read', 'View applications'),
      ('applications.write', 'Create and edit applications'),
      ('research.read', 'View university and research records'),
      ('research.write', 'Create and edit university and research records'),
      ('documents.read', 'Download authorized documents'),
      ('documents.write', 'Upload and replace authorized documents'),
      ('documents.delete', 'Delete authorized documents'),
      ('sources.review', 'Approve or reject source changes'),
      ('reports.read', 'View reports and dashboards'),
      ('users.manage', 'Manage user accounts and role assignments'),
      ('settings.manage', 'Manage system settings'),
      ('backups.manage', 'Run and review backups');

    INSERT INTO role_permissions (role_id, permission_id)
    SELECT roles.id, permissions.id
    FROM roles
    CROSS JOIN permissions
    WHERE roles.code = 'admin';

    INSERT INTO role_permissions (role_id, permission_id)
    SELECT roles.id, permissions.id
    FROM roles
    CROSS JOIN permissions
    WHERE roles.code = 'staff'
      AND permissions.code IN (
        'students.read',
        'students.write',
        'applications.read',
        'applications.write',
        'research.read',
        'research.write',
        'documents.read',
        'documents.write',
        'sources.review',
        'reports.read'
      );
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE user_sessions;
    DROP TABLE role_permissions;
    DROP TABLE user_roles;
    DROP TABLE permissions;
    DROP TABLE roles;
    DROP TABLE app_users;
  `);
};
