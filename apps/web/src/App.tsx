import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Layout,
  Modal,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography
} from "antd";
import type { TableColumnsType } from "antd";
import { StudentApiError, listStudentDocuments } from "./api/students";
import {
  createStudent,
  listStudents,
  studentStatuses,
  updateStudent
} from "./api/students";
import type { Student, StudentDocument, StudentInput, StudentStatus } from "./api/students";
import { StudentIntakePage } from "./StudentIntakePage";

const { Header, Content } = Layout;
const { Text, Title } = Typography;
const pageSize = 10;

const statusLabels: Record<StudentStatus, string> = {
  consultation: "Consultation",
  profile_assessment: "Profile assessment",
  research_selection: "Research selection",
  application_preparation: "Application prep",
  submitted: "Submitted",
  admitted: "Admitted",
  completed: "Completed",
  inactive: "Inactive"
};

const statusColors: Record<StudentStatus, string> = {
  consultation: "blue",
  profile_assessment: "cyan",
  research_selection: "purple",
  application_preparation: "gold",
  submitted: "processing",
  admitted: "green",
  completed: "success",
  inactive: "default"
};

const statusOptions = studentStatuses.map((value) => ({
  value,
  label: statusLabels[value]
}));

function duplicateDescriptions(details: unknown): string[] {
  if (!Array.isArray(details)) return [];

  return details.flatMap((candidate) => {
    if (typeof candidate !== "object" || candidate === null) return [];
    if (!("internal_id" in candidate) || typeof candidate.internal_id !== "string") return [];
    if (!("full_name" in candidate) || typeof candidate.full_name !== "string") return [];
    return [`${candidate.full_name} (${candidate.internal_id})`];
  });
}

export function App() {
  return window.location.pathname === "/apply"
    ? <StudentIntakePage />
    : <StudentManager />;
}

function StudentManager() {
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StudentStatus | undefined>();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Student | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [form] = Form.useForm<StudentInput>();

  const loadStudents = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listStudents({
        q: search || undefined,
        status,
        page,
        pageSize,
        signal
      });
      setStudents(result.items);
      setTotal(result.total);
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load students. Check that the API and PostgreSQL are available."
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    const controller = new AbortController();
    void loadStudents(controller.signal);
    return () => controller.abort();
  }, [loadStudents]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: "consultation" });
    setModalOpen(true);
  }

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

  function openEdit(student: Student) {
    setEditing(student);
    form.setFieldsValue({
      fullName: student.fullName,
      email: student.email ?? "",
      phone: student.phone ?? "",
      nationality: student.nationality ?? "",
      status: student.status
    });
    setModalOpen(true);
  }

  async function persistStudent(values: StudentInput, confirmPotentialDuplicate: boolean) {
    setSaving(true);
    try {
      if (editing) {
        await updateStudent(editing.id, values);
      } else {
        await createStudent(values, confirmPotentialDuplicate);
      }
      setModalOpen(false);
      if (editing) {
        await loadStudents();
      } else {
        setSearchText("");
        setSearch("");
        setStatus(undefined);
        setPage(1);
      }
    } catch (saveError) {
      if (
        !editing &&
        !confirmPotentialDuplicate &&
        saveError instanceof StudentApiError &&
        saveError.code === "POTENTIAL_DUPLICATE"
      ) {
        const matches = duplicateDescriptions(saveError.details);
        Modal.confirm({
          title: "Possible duplicate student",
          content: (
            <div>
              <p>{saveError.message}</p>
              {matches.length > 0 && (
                <ul>{matches.map((match) => <li key={match}>{match}</li>)}</ul>
              )}
            </div>
          ),
          okText: "Create a separate record",
          cancelText: "Review existing records",
          onOk: () => persistStudent(values, true)
        });
        return;
      }
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save this student. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveStudent() {
    const values = await form.validateFields();
    await persistStudent(values, false);
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
      title: "Nationality",
      dataIndex: "nationality",
      key: "nationality",
      responsive: ["lg"],
      render: (value: string | null) => value || "—"
    },
    {
      title: "Journey stage",
      dataIndex: "status",
      key: "status",
      render: (value: StudentStatus) => (
        <Tag color={statusColors[value]}>{statusLabels[value]}</Tag>
      )
    },
    {
      title: "",
      key: "action",
      align: "right",
      render: (_value, student) => (
        <Space>
          <Button type="link" onClick={() => void openDetails(student)}>View</Button>
          <Button type="link" onClick={() => openEdit(student)}>Edit</Button>
        </Space>
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
          <div className="breadcrumb">Workspace <span>/</span> Students</div>

          <section className="page-heading">
            <div>
              <Text className="eyebrow">STUDENT CRM</Text>
              <Title level={1}>Students</Title>
              <Text type="secondary">Manage student profiles and track their journey to Japan.</Text>
            </div>
            <Space wrap>
              <Button href="/apply" target="_blank">Preview student form</Button>
              <Button type="primary" size="large" onClick={openCreate}>Add student</Button>
            </Space>
          </section>

          {error && (
            <Alert
              className="error-alert"
              type="error"
              showIcon
              title="Student records could not be loaded"
              description={`${error} Make sure PostgreSQL is running, the database is configured in apps\\api\\.env, and migrations have been applied.`}
              action={<Button size="small" onClick={() => void loadStudents()}>Retry</Button>}
            />
          )}

          <div className="summary-grid">
            <Card className="summary-card">
              <Statistic title="Student records" value={error ? "—" : total} />
              <Text type="secondary">Matching your current filters</Text>
            </Card>
            <Card className="summary-card summary-card-muted">
              <Statistic title="Showing on this page" value={error ? "—" : students.length} />
              <Text type="secondary">Up to {pageSize} records per page</Text>
            </Card>
            <Card className="summary-card summary-card-muted">
              <Statistic title="Current page" value={error ? "—" : page} />
              <Text type="secondary">Search and filters update results</Text>
            </Card>
          </div>

          <Card className="table-card" styles={{ body: { padding: 0 } }}>
            <div className="table-toolbar">
              <div>
                <Title level={4}>All students</Title>
                <Text type="secondary">Search by student ID, name, email, phone or nationality.</Text>
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
                <Select
                  allowClear
                  placeholder="All stages"
                  options={statusOptions}
                  value={status}
                  onChange={(value: StudentStatus | undefined) => {
                    setPage(1);
                    setStatus(value);
                  }}
                  style={{ width: 190 }}
                />
              </Space>
            </div>

            {loading ? (
              <div className="loading-state"><Spin size="large" /></div>
            ) : !error && students.length === 0 ? (
              <div className="empty-state">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={search || status ? "No students match these filters" : "No student records yet"}
                >
                  {!search && !status && <Button type="primary" onClick={openCreate}>Add your first student</Button>}
                </Empty>
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
                scroll={{ x: 660 }}
              />
            )}
          </Card>

          <footer className="page-footer">
            Student information is sensitive. This development app is restricted to this PC and is not ready for LAN access.
          </footer>
        </div>
      </Content>

      <Modal
        title={editing ? "Edit student" : "Add student"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void saveStudent()}
        okText={editing ? "Save changes" : "Create student"}
        confirmLoading={saving}
        forceRender
      >
        <Form<StudentInput>
          form={form}
          layout="vertical"
          requiredMark="optional"
          initialValues={{ status: "consultation" }}
        >
          <Form.Item
            name="fullName"
            label="Full name"
            rules={[{ required: true, whitespace: true, message: "Enter the student's name" }, { max: 200 }]}
          >
            <Input autoComplete="name" placeholder="Student full name" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: "email", message: "Enter a valid email address" }, { max: 320 }]}>
            <Input autoComplete="email" placeholder="name@example.com" />
          </Form.Item>
          <div className="form-row">
            <Form.Item name="phone" label="Phone" rules={[{ max: 50 }]} className="form-grow">
              <Input autoComplete="tel" placeholder="Phone number" />
            </Form.Item>
            <Form.Item name="nationality" label="Nationality" rules={[{ max: 100 }]} className="form-grow">
              <Input placeholder="Nationality" />
            </Form.Item>
          </div>
          <Form.Item name="status" label="Journey stage" rules={[{ required: true }]}>
            <Select options={statusOptions} />
          </Form.Item>
          {!editing && (
            <Text type="secondary" className="form-hint">
              A stable internal student ID will be generated automatically.
            </Text>
          )}
        </Form>
      </Modal>

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
                        href={`/api/students/${encodeURIComponent(selectedStudent.id)}/documents/${encodeURIComponent(document.type)}`}
                        download={document.fileName}
                      >
                        {document.fileName}
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
    </Layout>
  );
}
