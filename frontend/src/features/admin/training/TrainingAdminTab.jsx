import { adminRequest } from "../shared/adminClient";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Modal, Space } from "antd";
import {
  Button,
  DataTable,
  FilterBar,
  MetricsStrip,
  SelectInput,
  StatusTag,
  TextInput,
  Toolbar,
} from "../../../ui";

function adminHeaders() {
  return { "Content-Type": "application/json" };
}

function formatMs(ms) {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(2)}с`;
}

function formatDate(value) {
  return value ? value.slice(0, 16).replace("T", " ") : "—";
}

function modeTag(course) {
  return course.pause_between === false
    ? <StatusTag status="confirmed" label="Тренировка" />
    : <StatusTag status="warning" label="Экзамен" />;
}

function runStatusTag(status) {
  if (status === "completed") return <StatusTag status="confirmed" label="Завершен" />;
  if (status === "running") return <StatusTag status="pending" label="Идет" />;
  if (status === "cancelled") return <StatusTag status="offline" label="Отменен" />;
  return <StatusTag status="neutral" label={status || "—"} />;
}

function searchText(values) {
  return values.filter(Boolean).join(" ").toLowerCase();
}

export function TrainingAdminTab({ adminToken, onError }) {
  const [courses, setCourses] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [courseSearch, setCourseSearch] = useState("");
  const [courseModeFilter, setCourseModeFilter] = useState("all");
  const [runSearch, setRunSearch] = useState("");
  const [runStatusFilter, setRunStatusFilter] = useState("all");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, rRes] = await Promise.all([
        adminRequest("/admin/courses", { headers: adminHeaders(adminToken) }),
        adminRequest("/admin/training/runs", { headers: adminHeaders(adminToken) }),
      ]);
      if (cRes.ok) setCourses(await cRes.json());
      if (rRes.ok) setRuns(await rRes.json());
    } catch (e) {
      onError?.("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [adminToken, onError]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const deleteCourse = (courseId) => {
    Modal.confirm({
      title: "Удалить курс?",
      content: `Курс #${courseId} будет удален.`,
      okText: "Удалить",
      okButtonProps: { danger: true },
      cancelText: "Отмена",
      onOk: async () => {
        try {
          const res = await adminRequest(`/admin/courses/${courseId}`, {
            method: "DELETE",
            headers: adminHeaders(adminToken),
          });
          if (res.ok) {
            setCourses((prev) => prev.filter((course) => course.id !== courseId));
          }
        } catch (e) {
          onError?.("Ошибка удаления");
        }
      },
    });
  };

  const filteredCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase();
    return courses.filter((course) => {
      const mode = course.pause_between === false ? "training" : "exam";
      if (courseModeFilter !== "all" && mode !== courseModeFilter) return false;
      if (!q) return true;
      return searchText([course.id, course.name, course.description, course.captcha_count]).includes(q);
    });
  }, [courseModeFilter, courseSearch, courses]);

  const filteredRuns = useMemo(() => {
    const q = runSearch.trim().toLowerCase();
    return runs.filter((run) => {
      if (runStatusFilter !== "all" && run.status !== runStatusFilter) return false;
      if (!q) return true;
      return searchText([run.id, run.participant_type, run.participant_label, run.course_name, run.status]).includes(q);
    });
  }, [runSearch, runStatusFilter, runs]);

  const stats = useMemo(() => {
    const completed = runs.filter((run) => run.status === "completed");
    const running = runs.filter((run) => run.status === "running");
    const totalAnswers = completed.reduce((sum, run) => sum + Number(run.stats?.total || 0), 0);
    const correct = completed.reduce((sum, run) => sum + Number(run.stats?.correct || 0), 0);
    const avgDuration = completed.length
      ? completed.reduce((sum, run) => sum + Number(run.stats?.avg_duration_ms || 0), 0) / completed.length
      : null;
    return {
      completed: completed.length,
      running: running.length,
      accuracy: totalAnswers ? Math.round((correct / totalAnswers) * 100) : 0,
      avgDuration,
    };
  }, [runs]);

  const metrics = [
    { key: "courses", label: "Курсы", value: `${filteredCourses.length} / ${courses.length}`, tone: filteredCourses.length === courses.length ? "neutral" : "warning" },
    { key: "runs", label: "Прогоны", value: `${filteredRuns.length} / ${runs.length}`, tone: filteredRuns.length === runs.length ? "neutral" : "warning" },
    { key: "running", label: "Идут", value: stats.running, tone: stats.running > 0 ? "warning" : "neutral" },
    { key: "completed", label: "Завершены", value: stats.completed, tone: stats.completed > 0 ? "success" : "neutral" },
    { key: "accuracy", label: "Точность", value: `${stats.accuracy}%`, tone: stats.accuracy >= 80 ? "success" : "warning" },
    { key: "avg", label: "Сред. время", value: formatMs(stats.avgDuration), tone: "info" },
  ];

  const courseColumns = [
    { title: "ID", dataIndex: "id", width: 64, render: (value) => <span className="text-muted">#{value}</span> },
    { title: "Название", dataIndex: "name", width: 190, ellipsis: true, render: (value) => <span title={value}>{value}</span> },
    { title: "Описание", dataIndex: "description", ellipsis: true, render: (value) => <span title={value || "—"}>{value || "—"}</span> },
    { title: "Капч", dataIndex: "captcha_count", width: 76, align: "center" },
    { title: "Режим", width: 116, align: "center", render: (_, course) => modeTag(course) },
    { title: "Создан", dataIndex: "created_at", width: 128, render: formatDate },
    {
      title: "",
      width: 90,
      align: "right",
      render: (_, course) => <Button size="small" variant="danger" onClick={() => deleteCourse(course.id)}>Удалить</Button>,
    },
  ];

  const runColumns = [
    { title: "ID", dataIndex: "id", width: 64, render: (value) => <span className="text-muted">#{value}</span> },
    {
      title: "Участник",
      width: 190,
      ellipsis: true,
      render: (_, run) => (
        <div className="training-run-person">
          <span title={run.participant_label}>{run.participant_label || "—"}</span>
          <span className="text-muted">{run.participant_type || "—"}</span>
        </div>
      ),
    },
    { title: "Курс", dataIndex: "course_name", ellipsis: true, render: (value) => <span title={value || "—"}>{value || "—"}</span> },
    { title: "Статус", dataIndex: "status", width: 112, align: "center", render: runStatusTag },
    { title: "Верно", width: 78, align: "center", render: (_, run) => `${run.stats?.correct || 0}/${run.stats?.total || 0}` },
    { title: "Сред.", width: 84, align: "center", render: (_, run) => formatMs(run.stats?.avg_duration_ms) },
    { title: "Иконка", width: 84, align: "center", render: (_, run) => formatMs(run.stats?.avg_icon_ms) },
    { title: "Начат", dataIndex: "created_at", width: 128, render: formatDate },
    {
      title: "",
      width: 112,
      align: "right",
      render: (_, run) => (
        <Space size={4}>
          <Button size="small" onClick={() => window.open(`/training/run/${run.id}/results`, "_blank")}>Итог</Button>
          {run.status === "completed" ? (
            <Button size="small" onClick={() => window.open(`/training/run/${run.id}/review`, "_blank")}>Разбор</Button>
          ) : null}
        </Space>
      ),
    },
  ];

  if (loading) {
    return <div data-eopp-component="TrainingAdminTabLoading" className="text-center text-muted py-3">Загрузка...</div>;
  }

  return (
    <div data-eopp-component="TrainingAdminTab" className="training-admin-page">
      <Toolbar
        className="mb-3"
        left={
          <div>
            <h2 className="fs-6 fw-semibold mb-1">Обучение</h2>
            <div className="small text-muted">Курсы капч, экзамены, тренировки и результаты операторов</div>
          </div>
        }
        right={<Button size="small" onClick={fetchAll}>Обновить</Button>}
      />

      <MetricsStrip items={metrics} />

      <Card data-eopp-component="TrainingCoursesCard" className="mt-3" size="small" title="Курсы">
        <FilterBar className="mb-3">
          <label className="form-label small mb-0 training-search">
            Поиск
            <TextInput size="small" value={courseSearch} onChange={(event) => setCourseSearch(event.target.value)} placeholder="название, описание, ID" />
          </label>
          <label className="form-label small mb-0">
            Режим
            <SelectInput
              size="small"
              value={courseModeFilter}
              onChange={(value) => setCourseModeFilter(value || "all")}
              options={[
                { value: "all", label: "Все" },
                { value: "training", label: "Тренировка" },
                { value: "exam", label: "Экзамен" },
              ]}
              allowClear={false}
            />
          </label>
        </FilterBar>
        <DataTable
          className="training-courses-table"
          rowKey="id"
          data={filteredCourses}
          columns={courseColumns}
          emptyText="Нет курсов"
          pagination
          scroll={false}
        />
      </Card>

      <Card data-eopp-component="TrainingRunsCard" className="mt-3" size="small" title="Прогоны">
        <FilterBar className="mb-3">
          <label className="form-label small mb-0 training-search">
            Поиск
            <TextInput size="small" value={runSearch} onChange={(event) => setRunSearch(event.target.value)} placeholder="участник, курс, ID" />
          </label>
          <label className="form-label small mb-0">
            Статус
            <SelectInput
              size="small"
              value={runStatusFilter}
              onChange={(value) => setRunStatusFilter(value || "all")}
              options={[
                { value: "all", label: "Все" },
                { value: "completed", label: "Завершены" },
                { value: "running", label: "Идут" },
                { value: "cancelled", label: "Отменены" },
              ]}
              allowClear={false}
            />
          </label>
        </FilterBar>
        <DataTable
          className="training-runs-table"
          rowKey="id"
          data={filteredRuns}
          columns={runColumns}
          emptyText="Нет прогонов"
          pagination
          scroll={false}
        />
      </Card>
    </div>
  );
}
