export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE students (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      internal_id varchar(20) NOT NULL UNIQUE,
      full_name varchar(200) NOT NULL CHECK (length(btrim(full_name)) > 0),
      email varchar(320),
      phone varchar(50),
      nationality varchar(100),
      status varchar(40) NOT NULL DEFAULT 'consultation'
        CHECK (status IN (
          'consultation',
          'profile_assessment',
          'research_selection',
          'application_preparation',
          'submitted',
          'admitted',
          'completed',
          'inactive'
        )),
      assigned_staff_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX students_status_updated_idx ON students (status, updated_at DESC);
    CREATE INDEX students_name_lower_idx ON students (lower(full_name));
    CREATE INDEX students_email_lower_idx ON students (lower(email)) WHERE email IS NOT NULL;
  `);
};

export const down = (pgm) => {
  pgm.sql("DROP TABLE students;");
};
