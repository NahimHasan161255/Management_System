import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Layout,
  Select,
  Typography
} from "antd";
import type { StudentDocumentType, StudentIntakeInput } from "./api/students";
import { submitStudentIntake } from "./api/students";

const { Header, Content } = Layout;
const { Text, Title } = Typography;

const documentFields: {
  type: StudentDocumentType;
  label: string;
  accept: string;
}[] = [
  { type: "passport_photo", label: "Passport-size photo", accept: "image/jpeg,image/png" },
  { type: "ssc_certificate", label: "SSC certificate", accept: "application/pdf" },
  { type: "ssc_transcript", label: "SSC transcript", accept: "application/pdf" },
  { type: "hsc_certificate", label: "HSC certificate", accept: "application/pdf" },
  { type: "hsc_transcript", label: "HSC transcript", accept: "application/pdf" },
  { type: "bachelor_certificate", label: "Bachelor certificate", accept: "application/pdf" },
  { type: "bachelor_transcript", label: "Bachelor transcript", accept: "application/pdf" },
  { type: "last_degree_certificate", label: "Last degree certificate", accept: "application/pdf" },
  { type: "last_degree_transcript", label: "Last degree transcript", accept: "application/pdf" },
  { type: "passport", label: "Passport", accept: "application/pdf" },
  { type: "language_proof", label: "JLPT / IELTS / MOI proof", accept: "application/pdf" }
];

export function StudentIntakePage() {
  const [form] = Form.useForm<StudentIntakeInput>();
  const [files, setFiles] = useState<Partial<Record<StudentDocumentType, File>>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);

  async function submit(values: StudentIntakeInput) {
    setSubmitting(true);
    setError(null);
    try {
      const student = await submitStudentIntake(values, files);
      setStudentId(student.internalId);
      form.resetFields();
      setFiles({});
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Your information could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateFile(type: StudentDocumentType, accept: string, file?: File) {
    setUploadError(null);
    if (!file) {
      setFiles((current) => {
        const next = { ...current };
        delete next[type];
        return next;
      });
      return;
    }

    const permittedTypes = accept.split(",");
    if (!permittedTypes.includes(file.type)) {
      setUploadError("Choose a file in the format shown for that field.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Each file must be no larger than 10 MB.");
      return;
    }
    const totalSize = Object.entries(files)
      .filter(([currentType]) => currentType !== type)
      .reduce((total, [, currentFile]) => total + (currentFile?.size ?? 0), file.size);
    if (totalSize > 35 * 1024 * 1024) {
      setUploadError("All selected files together must be no larger than 35 MB.");
      return;
    }
    setFiles((current) => ({ ...current, [type]: file }));
  }

  return (
    <Layout className="app-layout">
      <Header className="topbar">
        <a className="brand" href="/" aria-label="Student management home">
          <span className="brand-mark">J</span>
          <span className="brand-name">HSM <Text type="secondary">JAPAN</Text></span>
        </a>
        <Text type="secondary">Student intake · local PC only</Text>
      </Header>

      <Content className="main-content">
        <div className="content-width intake-width">
          <div className="breadcrumb"><a href="/">Students</a><span>/</span>Student form</div>
          <section className="page-heading">
            <div>
              <Text className="eyebrow">STUDENT INFORMATION</Text>
              <Title level={1}>Student intake form</Title>
              <Text type="secondary">Complete your details and attach the documents you currently have.</Text>
            </div>
          </section>

          <Alert
            className="error-alert"
            type="warning"
            showIcon
            title="This form is available only on this PC"
            description="This is not an internet link and there is no separate student login. Use it only on this PC under staff supervision; do not send the address outside this computer."
          />

          {studentId ? (
            <Card className="intake-card">
              <div className="success-state">
                <Text className="eyebrow">SUBMISSION COMPLETE</Text>
                <Title level={2}>Thank you</Title>
                <Text>Your information has been saved. Your student ID is:</Text>
                <Text strong className="intake-student-id">{studentId}</Text>
                <Button type="primary" onClick={() => setStudentId(null)}>Submit another response</Button>
              </div>
            </Card>
          ) : (
            <Card className="intake-card">
              {error && (
                <Alert
                  className="error-alert"
                  type="error"
                  showIcon
                  title="Submission failed"
                  description={error}
                />
              )}
              <Form<StudentIntakeInput>
                form={form}
                layout="vertical"
                requiredMark="optional"
                initialValues={{ languageQualification: "", studyFields: [] }}
                onFinish={(values) => void submit(values)}
              >
                <Title level={4}>Your details</Title>
                <Form.Item
                  name="fullName"
                  label="Full name"
                  rules={[{ required: true, whitespace: true, message: "Enter your full name" }, { max: 200 }]}
                >
                  <Input autoComplete="name" placeholder="As shown on your passport" />
                </Form.Item>
                <div className="form-row">
                  <Form.Item
                    name="phone"
                    label="Contact number"
                    rules={[{ required: true, whitespace: true, message: "Enter your contact number" }, { max: 50 }]}
                    className="form-grow"
                  >
                    <Input autoComplete="tel" placeholder="Include country code" />
                  </Form.Item>
                  <Form.Item
                    name="email"
                    label="Gmail / email"
                    rules={[{ required: true, type: "email", message: "Enter a valid email address" }, { max: 320 }]}
                    className="form-grow"
                  >
                    <Input autoComplete="email" placeholder="name@example.com" />
                  </Form.Item>
                </div>
                <Form.Item name="snsUrl" label="One social media profile link" rules={[{ type: "url", message: "Enter a complete link, including https://" }, { max: 2048 }]}>
                  <Input type="url" placeholder="https://..." />
                </Form.Item>

                <Title level={4}>Education and language</Title>
                <Form.Item
                  name="lastDegree"
                  label="Last completed degree"
                  rules={[{ required: true, whitespace: true, message: "Enter your last completed degree" }, { max: 200 }]}
                >
                  <Input placeholder="For example, HSC or Bachelor's degree" />
                </Form.Item>
                <Form.Item name="languageQualification" label="Language qualification">
                  <Select
                    allowClear
                    options={[
                      { value: "JLPT", label: "JLPT" },
                      { value: "IELTS", label: "IELTS" },
                      { value: "MOI", label: "MOI" }
                    ]}
                    placeholder="Select if you have one"
                  />
                </Form.Item>
                <Form.Item
                  name="studyFields"
                  label="Interested study fields (up to 5)"
                  rules={[{ required: true, type: "array", min: 1, message: "Add at least one field of interest" }]}
                >
                  <Select
                    mode="tags"
                    tokenSeparators={[","]}
                    maxCount={5}
                    placeholder="Type a field and press Enter"
                  />
                </Form.Item>

                <Title level={4}>Documents</Title>
                <Text type="secondary">
                  Education and language documents are optional if you do not have them yet. Each file may be up to 10 MB; all selected files together may be up to 35 MB.
                </Text>
                <div className="document-grid">
                  {documentFields.map(({ type, label, accept }) => (
                    <div className="upload-field" key={type}>
                      <label>
                        <span>{label}</span>
                        <input
                          key={`${type}-${files[type]?.name ?? "empty"}`}
                          type="file"
                          accept={accept}
                          onChange={(event) => updateFile(type, accept, event.currentTarget.files?.[0])}
                        />
                      </label>
                      <Text type="secondary">{files[type]?.name ?? (type === "passport_photo" ? "JPG or PNG · optional" : "PDF · optional")}</Text>
                      {files[type] && (
                        <Button type="link" size="small" onClick={() => updateFile(type, accept)}>
                          Remove file
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {uploadError && <Alert className="upload-error" type="error" showIcon message={uploadError} />}
                <div className="intake-submit">
                  <Button type="primary" size="large" htmlType="submit" loading={submitting}>
                    Submit information
                  </Button>
                </div>
              </Form>
            </Card>
          )}
          <footer className="page-footer">
            Your files are saved in this computer's PostgreSQL database and are not exposed as public file links.
          </footer>
        </div>
      </Content>
    </Layout>
  );
}
