import { beforeEach, describe, expect, test, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import ReportsPage from "./ReportsPage"
import { socApi } from "../api"


vi.mock("../api", () => ({
  socApi: {
    downloadAlertsCsv: vi.fn(),
    downloadSecurityReport: vi.fn(),
  },
}))


describe("ReportsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("displays the report options", () => {
    render(<ReportsPage />)

    expect(
      screen.getByRole("heading", {
        name: "Security Reports",
      })
    ).toBeInTheDocument()

    expect(
      screen.getByRole("button", {
        name: "Download CSV",
      })
    ).toBeInTheDocument()

    expect(
      screen.getByRole("button", {
        name: "Download JSON",
      })
    ).toBeInTheDocument()
  })

  test("downloads the CSV report when clicked", async () => {
    const user = userEvent.setup()

    socApi.downloadAlertsCsv.mockResolvedValue()

    render(<ReportsPage />)

    await user.click(
      screen.getByRole("button", {
        name: "Download CSV",
      })
    )

    expect(socApi.downloadAlertsCsv).toHaveBeenCalledOnce()
  })

  test("displays an error when the download fails", async () => {
  const user = userEvent.setup()

  socApi.downloadAlertsCsv.mockRejectedValueOnce(
    new Error("Download failed")
  )

  render(<ReportsPage />)

  await user.click(
    screen.getByRole("button", {
      name: "Download CSV",
    })
  )

  expect(
    await screen.findByText("Download failed")
  ).toBeInTheDocument()
 })
})