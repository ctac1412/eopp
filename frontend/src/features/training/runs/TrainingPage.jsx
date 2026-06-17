import { trainingService } from "../api/trainingService";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Card, Spin } from "antd";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, DataTable, MetricsStrip, StatusTag, Toolbar } from "../../../ui";

const API = "";

function loadApiKey() {
  const key = localStorage.getItem("kiosk_api_key");
  return key || "";
}

function formatMs(ms) {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(2)}с`;
}

function runStatus(status) {
  if (status === "completed") return "confirmed";
  if (status === "running") return "warning";
  if (status === "cancelled") return "offline";
  return "neutral";
}

function runStatusLabel(status) {
  if (status === "completed") return "Завершён";
  if (status === "running") return "В работе";
  if (status === "cancelled") return "Отменён";
  return status || "—";
}

export default function TrainingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [courses, setCourses] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [participantType, setParticipantType] = useState(null);
  const [participantId, setParticipantId] = useState(null);
  const [participantLabel, setParticipantLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [runsLoading, setRunsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showInstructions, setShowInstructions] = useState(true);

  useEffect(() => {
    const opUuid = searchParams.get("op");

    if (opUuid) {
      trainingService.request(`/training/resolve-operator?uuid=${encodeURIComponent(opUuid)}`)
        .then((response) => response.json())
        .then((data) => {
          if (data.operator_id) {
            setParticipantType("operator");
            setParticipantId(data.operator_id);
            setParticipantLabel(`Оператор: ${data.nickname || opUuid}`);
          }
        })
        .catch(() => {});
    } else {
      const apiKey = loadApiKey();
      if (apiKey) {
        trainingService.request("/validate-key")
          .then((response) => response.json())
          .then((data) => {
            if (data.valid && data.api_key_id) {
              setParticipantType("api_key");
              setParticipantId(data.api_key_id);
              setParticipantLabel(`API ключ: ${data.label || `#${data.api_key_id}`}`);
            }
          })
          .catch(() => {});
      } else {
        setParticipantType("api_key");
      }
    }
  }, [searchParams]);

  useEffect(() => {
    setCoursesLoading(true);
    trainingService.request(`/training/courses`)
      .then((response) => response.json())
      .then((data) => setCourses(Array.isArray(data) ? data : []))
      .catch(() => setCourses([]))
      .finally(() => setCoursesLoading(false));
  }, []);

  const refreshRuns = () => {
    if (participantId == null || !participantType) return;
    setRunsLoading(true);
    const params = new URLSearchParams();
    params.set("participant_type", participantType);
    params.set("participant_id", participantId);
    trainingService.request(`/training/runs?${params}`)
      .then((response) => response.json())
      .then((data) => setRuns(Array.isArray(data) ? data : []))
      .catch(() => setRuns([]))
      .finally(() => setRunsLoading(false));
  };

  useEffect(() => {
    refreshRuns();
    // refreshRuns intentionally depends on state; keep this effect bound to participant identity only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantType, participantId]);

  const startRun = async () => {
    if (!selectedCourse || participantId == null) {
      setError("Выберите курс");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await trainingService.request(`/training/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: selectedCourse,
          participant_type: participantType,
          participant_id: participantId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const pauseParam = data.pause_between === false ? "?pause=0" : "";
        navigate(`/training/run/${data.id}${pauseParam}`);
      } else {
        setError(data.error || "Ошибка запуска");
      }
    } catch {
      setError("Сетевая ошибка");
    } finally {
      setLoading(false);
    }
  };

  const completedRuns = runs.filter((run) => run.status === "completed");
  const runningRuns = runs.filter((run) => run.status === "running");
  const bestAccuracy = completedRuns.reduce((best, run) => {
    const total = run.stats?.total || 0;
    if (!total) return best;
    return Math.max(best, Math.round(((run.stats?.correct || 0) / total) * 100));
  }, 0);

  const metrics = useMemo(() => ([
    { key: "courses", label: "Курсов", value: courses.length, tone: "info" },
    { key: "runs", label: "Прогонов", value: runs.length, tone: "neutral" },
    { key: "completed", label: "Завершено", value: completedRuns.length, tone: "success" },
    { key: "running", label: "В работе", value: runningRuns.length, tone: "warning" },
    { key: "best", label: "Лучшая точность", value: completedRuns.length ? `${bestAccuracy}%` : "—", tone: "success" },
  ]), [bestAccuracy, completedRuns.length, courses.length, runningRuns.length, runs.length]);

  const columns = [
    {
      title: "ID",
      dataIndex: "id",
      width: 64,
      align: "center",
    },
    {
      title: "Курс",
      dataIndex: "course_name",
      ellipsis: true,
      render: (value) => <span title={value || "—"}>{value || "—"}</span>,
    },
    {
      title: "Статус",
      dataIndex: "status",
      width: 112,
      align: "center",
      render: (value) => <StatusTag status={runStatus(value)} label={runStatusLabel(value)} />,
    },
    {
      title: "Правильно",
      width: 98,
      align: "center",
      render: (_, run) => `${run.stats?.correct ?? 0}/${run.stats?.total ?? 0}`,
    },
    {
      title: "Сред. время",
      width: 112,
      align: "right",
      render: (_, run) => formatMs(run.stats?.avg_duration_ms),
    },
    {
      title: "Сред. иконка",
      width: 112,
      align: "right",
      render: (_, run) => formatMs(run.stats?.avg_icon_ms),
    },
    {
      title: "Дата",
      dataIndex: "created_at",
      width: 150,
      render: (value) => value?.slice(0, 16) || "—",
    },
    {
      title: "",
      width: 118,
      align: "right",
      render: (_, run) => run.status === "running" ? (
        <Button
          size="small"
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/training/run/${run.id}`);
          }}
        >
          Продолжить
        </Button>
      ) : null,
    },
  ];

  return (
    <div data-eopp-component="TrainingPage" className="training-page">
      <Toolbar
        className="training-page__toolbar"
        left={
          <Button size="small" href="/">
            На главную
          </Button>
        }
        right={
          participantId != null ? (
            <Button size="small" onClick={refreshRuns} loading={runsLoading}>
              Обновить историю
            </Button>
          ) : null
        }
      />

      <Card
        data-eopp-component="TrainingIntroCard"
        className="training-page__intro"
        size="small"
        title="Обучение"
        extra={<StatusTag status={participantId != null ? "confirmed" : "warning"} label={participantId != null ? "Участник определён" : "Нужен API ключ"} />}
      >
        <div className="training-page__subtitle">
          Тестовый полигон для тренировки решения капч.
        </div>
        <div className="training-page__participant">
          <span>Участник</span>
          {participantType == null ? (
            <Spin size="small" />
          ) : participantLabel ? (
            <strong>{participantLabel}</strong>
          ) : (
            <a href="/">Войдите с API ключом</a>
          )}
        </div>
        <MetricsStrip items={metrics} />
      </Card>

      {showInstructions && (
        <Card
          data-eopp-component="TrainingInstructionsCard"
          className="training-page__instructions"
          size="small"
          title="Инструкция"
          extra={
            <Button size="small" onClick={() => setShowInstructions(false)}>
              Скрыть
            </Button>
          }
        >
          <ol>
            <li>Выберите курс из списка. Курсы создаются администратором.</li>
            <li>Нажмите «Начать тестовый прогон».</li>
            <li>Капчи будут появляться по одной с интервалом 2-7 секунд.</li>
            <li>Решайте капчи как обычно. Время фиксируется автоматически.</li>
            <li>После прохождения всех капч вы увидите результаты.</li>
          </ol>
        </Card>
      )}

      <Card
        data-eopp-component="TrainingCoursesCard"
        size="small"
        title="Выберите курс"
      >
        {coursesLoading ? (
          <div className="training-page__loading"><Spin /></div>
        ) : courses.length === 0 ? (
          <Alert type="info" showIcon message="Нет доступных курсов" />
        ) : (
          <div className="training-courses-grid">
            {courses.map((course) => {
              const active = selectedCourse === course.id;
              return (
                <Button
                  data-eopp-component="TrainingCourseCard"
                  key={course.id}
                  htmlType="button"
                  className={`training-course-card ${active ? "is-active" : ""}`}
                  onClick={() => setSelectedCourse(course.id)}
                >
                  <span className="training-course-card__title">{course.name}</span>
                  <StatusTag status="neutral" label={`${course.captcha_count} капч`} />
                  {course.description && (
                    <span className="training-course-card__description">{course.description}</span>
                  )}
                </Button>
              );
            })}
          </div>
        )}
        <div className="training-page__start">
          <Button
            variant="primary"
            onClick={startRun}
            disabled={loading || !selectedCourse || participantId == null}
            loading={loading}
          >
            Начать тестовый прогон
          </Button>
          {error && <Alert type="error" showIcon message={error} />}
        </div>
      </Card>

      <Card
        data-eopp-component="TrainingRunsCard"
        size="small"
        title="История прогонов"
      >
        <DataTable
          data-eopp-component="TrainingRunsTable"
          className="training-runs-public-table"
          rowKey="id"
          data={runs}
          columns={columns}
          loading={runsLoading}
          emptyText="Нет прогонов"
          pagination
          scroll={{ x: 840 }}
          onRow={(run) => ({
            onClick: () => navigate(`/training/run/${run.id}/results`),
            className: "training-runs-public-table__row",
          })}
        />
      </Card>
    </div>
  );
}
