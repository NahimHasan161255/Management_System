import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Layout,
  Modal,
  Result,
  Space,
  Spin,
  Table,
  Typography
} from "antd";
import type { TableColumnsType } from "antd";
import { checkApiReadiness, importStudentCsv, listStudentDocuments } from "./api/students";
import {
  listStudents,
} from "./api/students";
import type { Student, StudentDocument } from "./api/students";
import { StudentIntakePage } from "./StudentIntakePage";

const { Header, Content } = Layout;
const { Text, Title } = Typography;
const pageSize = 10;

export function App() {
  return window.location.pathname === "/apply"
    ? <StudentIntakePage />
    : <StudentManager />;
}

function StudentManager() {
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<Awaited<ReturnType<typeof importStudentCsv>> | null>(null);

  const loadStudents = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listStudents({
        q: search || undefined,
        page,
        pageSize,
        signal
      });
      setStudents(result.items);
      setTotal(result.total);
    } catch (loadError) {
      if (signal?.aborted) return;
      try {
        await checkApiReadiness(signal);
        setError(
          "Student records could not be loaded. Check that the latest database migrations have been applied, then retry."
        );
      } catch {
        if (signal?.aborted) return;
        setError(
          "Cannot connect to PostgreSQL. Start the local PostgreSQL service, check DATABASE_URL in apps\\api\\.env, then retry."
        );
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const controller = new AbortController();
    void loadStudents(controller.signal);
    return () => controller.abort();
  }, [loadStudents]);

  async function openDetails(student: Student) {
    setSelectedStudent(student);
    setDocuments([]);
    setDetailError(null);
    setDetailOpen(true);
    setDocumentsLoading(true);
    try {
      setDocuments(await listStudentDocuments(student.id));
    } catch (loadError) {
      setDetailError(loadError instanceof Error ? loadError.message : "Could not load student documents.");
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function submitImport() {
    if (!importFile) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await importStudentCsv(importFile);
      setImportResult(result);
      setSearchText("");
      setSearch("");
      setPage(1);
      const studentsPage = await listStudents({ page: 1, pageSize });
      setStudents(studentsPage.items);
      setTotal(studentsPage.total);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The CSV could not be imported.");
    } finally {
      setImporting(false);
    }
  }

  const columns: TableColumnsType<Student> = [
    {
      title: "Student",
      dataIndex: "fullName",
      key: "name",
      render: (_value, student) => (
        <div className="student-name-cell">
          <Text strong>{student.fullName}</Text>
          <Text type="secondary" className="student-id">{student.internalId}</Text>
        </div>
      )
    },
    {
      title: "Contact",
      key: "contact",
      responsive: ["md"],
      render: (_value, student) => (
        <div className="student-name-cell">
          <Text>{student.email || "—"}</Text>
          <Text type="secondary">{student.phone || "No phone added"}</Text>
        </div>
      )
    },
    {
      title: "",
      key: "action",
      align: "right",
      render: (_value, student) => (
        <Button type="link" onClick={() => void openDetails(student)}>View</Button>
      )
    }
  ];

  return (
    <Layout className="app-layout">
      <Header className="topbar">
        <a className="brand" href="/" aria-label="Japan Student Management System home">
          <span className="brand-mark">J</span>
          <span className="brand-name">HSM <Text type="secondary">JAPAN</Text></span>
        </a>
        <div className="topbar-meta">
          <span className="local-indicator" />
          <Text type="secondary">Local workspace</Text>
          <span className="avatar">NH</span>
        </div>
      </Header>

      <Content className="main-content">
        <div className="content-width">
          <section className="page-heading">
            <div>
              <Text className="eyebrow">STUDENT MANAGEMENT</Text>
              <Title level={1}>Students</Title>
              <Text type="secondary">Search student profiles, review documents, or import Google Forms responses.</Text>
            </div>
            <Space wrap>
              <Button onClick={() => {
                setImportOpen(true);
                setImportFile(null);
                setImportError(null);
                setImportResult(null);
              }}>Import Google Forms CSV</Button>
              <Button href="/apply" target="_blank">Preview student form</Button>
            </Space>
          </section>

          {error && (
            <Alert
              className="error-alert"
              type="error"
              showIcon
              title="Student records could not be loaded"
              description={error}
              action={<Button size="small" onClick={() => void loadStudents()}>Retry</Button>}
            />
          )}

          <Card className="table-card" styles={{ body: { padding: 0 } }}>
            <div className="table-toolbar">
              <div>
                <Title level={4}>Student records <Text type="secondary">({error ? "—" : total})</Text></Title>
                <Text type="secondary">Search by name, student ID, email, phone or study field.</Text>
              </div>
              <Space wrap>
                <Input.Search
                  allowClear
                  placeholder="Search students"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  onSearch={(value) => {
                    setPage(1);
                    setSearch(value.trim());
                  }}
                  style={{ width: 250 }}
                />
              </Space>
            </div>

            {loading ? (
              <div className="loading-state"><Spin size="large" /></div>
            ) : error ? (
              <div className="empty-state">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="Student records are unavailable until the database connection is restored"
                >
                  <Button onClick={() => void loadStudents()}>Retry</Button>
                </Empty>
              </div>
            ) : students.length === 0 ? (
              <div className="empty-state">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={search ? "No students match this search" : "No student records yet"}
                />
              </div>
            ) : (
              <Table<Student>
                rowKey="id"
                columns={columns}
                dataSource={students}
                pagination={{
                  current: page,
                  pageSize,
                  total,
                  showSizeChanger: false,
                  onChange: setPage,
                  showTotal: (count, range) => `${range[0]}–${range[1]} of ${count}`
                }}
                scroll={{ x: 540 }}
              />
            )}
          </Card>

          <footer className="page-footer">
            Student information is sensitive. This app is local-only; do not expose it to a network.
          </footer>
        </div>
      </Content>

      <Modal
        title="Student information"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={<Button onClick={() => setDetailOpen(false)}>Close</Button>}
      >
        {selectedStudent && (
          <div className="student-details">
            <div><Text type="secondary">Student ID</Text><Text strong>{selectedStudent.internalId}</Text></div>
            <div><Text type="secondary">Name</Text><Text>{selectedStudent.fullName}</Text></div>
            <div><Text type="secondary">Contact</Text><Text>{selectedStudent.phone || "—"}</Text></div>
            <div><Text type="secondary">Email</Text><Text>{selectedStudent.email || "—"}</Text></div>
            <div><Text type="secondary">Social profile</Text>
              {selectedStudent.snsUrl
                ? <a href={selectedStudent.snsUrl} target="_blank" rel="noreferrer">{selectedStudent.snsUrl}</a>
                : <Text>—</Text>}
            </div>
            <div><Text type="secondary">Last degree</Text><Text>{selectedStudent.lastDegree || "—"}</Text></div>
            <div><Text type="secondary">Language qualification</Text><Text>{selectedStudent.languageQualification || "—"}</Text></div>
            <div><Text type="secondary">Study fields</Text><Text>{selectedStudent.studyFields.join(", ") || "—"}</Text></div>
            <div className="student-documents">
              <Text strong>Uploaded documents</Text>
              {detailError && <Alert type="error" showIcon message={detailError} />}
              {documentsLoading ? (
                <Spin size="small" />
              ) : documents.length ? (
                <ul>
                  {documents.map((document) => (
                    <li key={document.type}>
                      <a
                        href={document.externalUrl ?? `/api/students/${encodeURIComponent(selectedStudent.id)}/documents/${encodeURIComponent(document.type)}`}
                        download={document.externalUrl ? undefined : document.fileName}
                        target={document.externalUrl ? "_blank" : undefined}
                        rel={document.externalUrl ? "noreferrer" : undefined}
                      >
                        {document.fileName}{document.externalUrl ? " (Google Drive)" : ""}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : !detailError ? (
                <Text type="secondary">No documents uploaded</Text>
              ) : null}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title="Import Google Forms responses"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onOk={() => void submitImport()}
        okText="Import responses"
        confirmLoading={importing}
        okButtonProps={{ disabled: !importFile || Boolean(importResult) }}
        width={620}
      >
        {importResult ? (
          <Result
            status={importResult.skipped.length ? "warning" : "success"}
            title={`${importResult.imported.length} of ${importResult.totalRows} students imported`}
            subTitle={`${importResult.skipped.length} rows skipped. Duplicate names/emails are skipped to avoid creating duplicate records.`}
          />
        ) : (
          <>
            <Alert
              className="error-alert"
              type="info"
              showIcon
              title="Export the responses sheet as CSV"
              description={(
                <div>
                  <p>Google Forms → Responses → open in Google Sheets → File → Download → Comma Separated Values (.csv).</p>
                  <p><a href="/google-forms-student-template.csv" download>Download the sample CSV header template</a>. Use the same question titles in your form:</p>
                  <p>Use these question titles in the form: Full name, Email address, Contact number, One social media profile link, Last completed degree, Language qualification, Interested study fields (up to 5), Passport-size photo, SSC certificate, SSC transcript, HSC certificate, HSC transcript, Bachelor certificate, Bachelor transcript, Last degree certificate, Last degree transcript, Passport, JLPT / IELTS / MOI proof.</p>
                  <p>Use semicolons between study fields. CSV exports can contain Drive/Docs links for uploaded files; only Google Drive/Docs links are imported. Students may need a Google account for file-upload questions.</p>
                </div>
              )}
            />
            {importError && <Alert className="error-alert" type="error" showIcon title="Import failed" description={importError} />}
            <Input
              key={importFile?.name ?? "empty-csv"}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                setImportFile(event.currentTarget.files?.[0] ?? null);
                setImportError(null);
              }}
            />
            {importFile && <Text type="secondary">{importFile.name}</Text>}
          </>
        )}
        {importResult && importResult.skipped.length > 0 && (
          <div className="import-skipped">
            <Text strong>Skipped rows</Text>
            <ul>
              {importResult.skipped.map((row) => (
                <li key={`${row.row}-${row.fullName}`}>Row {row.row} — {row.fullName}: {row.reason}</li>
              ))}
            </ul>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
