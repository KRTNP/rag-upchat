import { expect, test } from "@playwright/test"

test("chat page renders and has input", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByRole("heading", { name: "Contextual AI Assistant" })).toBeVisible()
  await expect(page.getByTestId("chat-input")).toBeVisible()
})

test("admin page renders login form", async ({ page }) => {
  await page.goto("/admin")

  await expect(page.getByRole("heading", { name: "Admin Access" })).toBeVisible()
  await expect(page.getByPlaceholder("Email")).toBeVisible()
  await expect(page.getByPlaceholder("Password")).toBeVisible()
})
