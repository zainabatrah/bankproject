import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_URL = "http://127.0.0.1:8001";

function SecurityEventsChart() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    async function loadEvents() {
      try {
        const response = await fetch(
          `${API_URL}/analytics/security-events-by-type`
        );

        if (!response.ok) {
          throw new Error("Could not load events");
        }

        const data = await response.json();

        const formattedData = Object.entries(data).map(
          ([eventType, count]) => ({
            eventType: eventType
              .replaceAll("_", " ")
              .toLowerCase(),
            count,
          })
        );

        setEvents(formattedData);
      } catch {
        setEvents([]);
      }
    }

    loadEvents();
  }, []);

  return (
    <section className="chart-panel">
      <div className="chart-header">
        <div>
          <h2>Security Events</h2>
          <p>Detected security activity by event type</p>
        </div>
      </div>

      <div className="chart-container">
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={events}
            layout="vertical"
            margin={{
              top: 5,
              right: 30,
              left: 45,
              bottom: 5,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
            />

            <XAxis
              type="number"
              allowDecimals={false}
            />

            <YAxis
              type="category"
              dataKey="eventType"
              width={150}
              tick={{ fontSize: 12 }}
            />

            <Tooltip />

            <Bar
              dataKey="count"
              name="Events"
              fill="#7c3aed"
              radius={[0, 6, 6, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export default SecurityEventsChart;