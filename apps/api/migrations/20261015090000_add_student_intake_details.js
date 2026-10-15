export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE students
      ADD COLUMN sns_url text,
      ADD COLUMN last_degree varchar(200),
      ADD COLUMN language_qualification varchar(10)
        CHECK (language_qualification IN ('JLPT', 'IELTS', 'MOI')),
      ADD COLUMN study_fields text[] NOT NULL DEFAULT '{}'
        CHECK (cardinality(study_fields) <= 5);

    CREATE TABLE student_documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      document_type varchar(40) NOT NULL
        CHECK (document_type IN (
          'passport_photo',
          'ssc_certificate',
          'ssc_transcript',
          'hsc_certificate',
          'hsc_transcript',
          'bachelor_certificate',
          'bachelor_transcript',
          'last_degree_certificate',
          'last_degree_transcript',
          'passport',
          'language_proof'
        )),
      original_name varchar(255) NOT NULL,
      mime_type varchar(100) NOT NULL,
      file_data bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (student_id, document_type)
    );

    CREATE INDEX student_documents_student_id_idx ON student_documents (student_id);
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE student_documents;
    ALTER TABLE students
      DROP COLUMN study_fields,
      DROP COLUMN language_qualification,
      DROP COLUMN last_degree,
      DROP COLUMN sns_url;
  `);
};
