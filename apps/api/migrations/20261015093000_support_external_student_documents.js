export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE student_documents
      ALTER COLUMN file_data DROP NOT NULL,
      ADD COLUMN external_url text,
      ADD CONSTRAINT student_documents_storage_check CHECK (
        (file_data IS NOT NULL AND external_url IS NULL)
        OR (file_data IS NULL AND external_url IS NOT NULL)
      ),
      ADD CONSTRAINT student_documents_external_url_check CHECK (
        external_url IS NULL OR external_url ~ '^https://(drive|docs)\\.google\\.com/'
      );
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DELETE FROM student_documents WHERE external_url IS NOT NULL;
    ALTER TABLE student_documents
      DROP CONSTRAINT student_documents_external_url_check,
      DROP CONSTRAINT student_documents_storage_check,
      DROP COLUMN external_url,
      ALTER COLUMN file_data SET NOT NULL;
  `);
};
