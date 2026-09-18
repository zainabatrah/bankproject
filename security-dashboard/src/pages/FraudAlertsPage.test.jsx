import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { render, screen, within,} from "@testing-library/react"

import FraudAlertsPage from "./FraudAlertsPage"
import { socApi } from "../api"


vi.mock("../api", () => ({
  socApi: {
    getAlerts: vi.fn(),
    addNote: vi.fn(),
    createCase: vi.fn(),
    updateAlertStatus: vi.fn(),
  },
}))


describe("FraudAlertsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("loads and displays fraud alerts", async () => {
    socApi.getAlerts.mockResolvedValueOnce([
      {
        id: 15,
        amount: 7500,
        risk_score: 100,
        severity: "CRITICAL",
        decision: "BLOCK",
        status: "OPEN",
        created_at: "2026-09-18T10:00:00Z",
      },
    ])

    render(<FraudAlertsPage />)

    expect(
      screen.getByText("Loading fraud alerts...")
    ).toBeInTheDocument()

    expect(
      await screen.findByText("#15")
    ).toBeInTheDocument()

    expect(
      screen.getByText("CRITICAL")
    ).toBeInTheDocument()

    expect(
      screen.getByText("BLOCK")
    ).toBeInTheDocument()

    expect(
      screen.getByText("Showing 1 of 1 alerts")
    ).toBeInTheDocument()
  })

  test("displays an error when alerts cannot load", async () => {
    socApi.getAlerts.mockRejectedValueOnce(
      new Error("Could not load fraud alerts")
    )

    render(<FraudAlertsPage />)

    expect(
      await screen.findByText("Could not load fraud alerts")
    ).toBeInTheDocument()
  })

  test("filters alerts by severity", async () => {
  const user = userEvent.setup()

  socApi.getAlerts.mockResolvedValueOnce([
    {
      id: 15,
      amount: 7500,
      risk_score: 100,
      severity: "CRITICAL",
      decision: "BLOCK",
      status: "OPEN",
      created_at: "2026-09-18T10:00:00Z",
    },
    {
      id: 16,
      amount: 300,
      risk_score: 10,
      severity: "LOW",
      decision: "APPROVE",
      status: "RESOLVED",
      created_at: "2026-09-18T11:00:00Z",
    },
  ])

  render(<FraudAlertsPage />)

  await screen.findByText("#15")

  await user.selectOptions(
    screen.getByLabelText("Severity"),
    "LOW"
  )

  expect(screen.queryByText("#15")).not.toBeInTheDocument()
  expect(screen.getByText("#16")).toBeInTheDocument()
  expect(
    screen.getByText("Showing 1 of 2 alerts")
  ).toBeInTheDocument()
})

test("updates an alert status", async () => {
  const user = userEvent.setup()

  socApi.getAlerts.mockResolvedValueOnce([
    {
      id: 15,
      amount: 7500,
      risk_score: 100,
      severity: "CRITICAL",
      decision: "BLOCK",
      status: "OPEN",
      created_at: "2026-09-18T10:00:00Z",
    },
  ])

  socApi.updateAlertStatus.mockResolvedValueOnce()

  render(<FraudAlertsPage />)

  const alertId = await screen.findByText("#15")
  const alertRow = alertId.closest("tr")
  const statusSelect = within(alertRow).getByRole("combobox")

  await user.selectOptions(statusSelect, "RESOLVED")

  expect(
    socApi.updateAlertStatus
  ).toHaveBeenCalledWith(15, "RESOLVED")

  expect(
    await screen.findByText(
      "Alert #15 changed to RESOLVED"
    )
  ).toBeInTheDocument()

  expect(statusSelect).toHaveValue("RESOLVED")
})
})