import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createPool } from "../server/config/database.js";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/services/passwords.js";

export async function browserSmoke(connectionString) {
  const config = {
    DATABASE_URL: connectionString,
    ssl: false,
    NODE_ENV: "test",
    APP_ORIGIN: "http://127.0.0.1",
    SESSION_SECRET: randomBytes(48).toString("hex"),
    SESSION_IDLE_MINUTES: 30,
    SESSION_ABSOLUTE_HOURS: 8,
    TRUST_PROXY: "0",
  };
  const pool = createPool(config);
  let server, browser;
  try {
    const password = randomBytes(24).toString("hex");
    await pool.query(
      "UPDATE usuarios SET senha_hash=$1 WHERE login IN ('master','ops_ouv','ops_gestor')",
      [await hashPassword(password)],
    );
    await pool.query("DELETE FROM limites_acesso");
    const app = await createApp(pool, config);
    server = await new Promise((resolveServer) => {
      const s = app.listen(0, "127.0.0.1", () => resolveServer(s));
    });
    config.APP_ORIGIN = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    await mkdir("test-results", { recursive: true });
    await page.goto(config.APP_ORIGIN);
    await expect(
      page.getByRole("heading", { name: "Bem-vindo ao SIO" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/login-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Esqueci minha senha" }).click();
    await expect(page.getByLabel("Código de recuperação")).toBeVisible();
    await page.getByRole("button", { name: "Voltar para o login" }).click();
    await page.getByLabel("Usuário", { exact: true }).fill("master");
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar no sistema" }).click();
    await expect(
      page.getByRole("heading", { name: "Visão geral" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/home-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Perfis e permissões", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Administração técnica" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Auditoria", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "auth.login", exact: true }).first(),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Auditoria técnica" }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("link", { name: "Visão geral" }).click();
    await expect(
      page.getByRole("heading", { name: "Visão geral" }),
    ).toBeVisible();
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw new Error("Overflow horizontal em viewport móvel.");
    await page.screenshot({
      path: "test-results/home-mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Sair do sistema" }).click();
    await expect(
      page.getByRole("heading", { name: "Bem-vindo ao SIO" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/login-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const login = async (name) => {
      await page.getByLabel("Usuário", { exact: true }).fill(name);
      await page.getByLabel("Senha", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Entrar no sistema" }).click();
      await expect(page.getByRole('button',{name:'Sair do sistema'})).toBeVisible();
      await page.goto(config.APP_ORIGIN);
      await expect(
        page.getByRole("heading", { name: "Visão geral", exact: true }),
      ).toBeVisible();
    };
    const logout = async () => {
      await page.getByRole("button", { name: "Sair do sistema" }).click();
      await expect(
        page.getByRole("heading", { name: "Bem-vindo ao SIO" }),
      ).toBeVisible();
    };
    await login("master");
    await page.getByRole("link", { name: "Cadastros", exact: true }).click();
    await page.getByRole("button", { name: "Motivos", exact: true }).click();
    await page
      .getByRole("button", { name: "Novo cadastro", exact: true })
      .click();
    await page
      .getByLabel("Nome", { exact: true })
      .fill("Motivo cadastrado pela interface");
    const area = (
      await pool.query(
        "SELECT a.* FROM areas_tecnicas a JOIN motivos m ON m.area_id=a.id WHERE m.nome='Qualidade de atendimento'",
      )
    ).rows[0];
    await page.getByLabel("Área", { exact: true }).selectOption(area.id);
    await page
      .getByRole("button", { name: "Salvar cadastro", exact: true })
      .click();
    await expect(page.getByText("Cadastro salvo.", {exact:true})).toBeVisible();
    await page.screenshot({
      path: "test-results/catalogs-desktop.png",
      fullPage: true,
    });
    await logout();
    await login("ops_ouv");
    await expect(
      page.getByText("Total de manifestações", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/dashboard-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Manifestações", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Nova manifestação", exact: true })
      .click();
    await page.getByLabel("Área", { exact: true }).selectOption(area.id);
    await page
      .getByLabel("Motivo", { exact: true })
      .selectOption({ label: "Qualidade de atendimento" });
    await page
      .getByLabel("Local da ocorrência", { exact: true })
      .selectOption({ label: "Setor de teste" });
    await page
      .getByLabel("Tempo de resposta", { exact: true })
      .selectOption({ label: "Geral — 5 dias" });
    await page
      .getByLabel("Gestor responsável", { exact: true })
      .selectOption({ label: "Gestor de teste" });
    await page
      .getByLabel("Nome do contato", { exact: true })
      .fill("Contato da validação visual");
    await page
      .getByLabel("Descritivo da manifestação", { exact: true })
      .fill("Atendimento registrado no navegador para validar todo o fluxo.");
    await page.getByRole("checkbox").check();
    await page.screenshot({
      path: "test-results/new-case-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Salvar e encaminhar", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: /OUV-/ })).toBeVisible();
    const caseUrl = page.url();
    await logout();
    await login("ops_gestor");
    await page.goto(caseUrl);
    await page
      .getByRole("button", { name: "Enviar resposta", exact: true })
      .click();
    await page
      .getByLabel("Análise", { exact: true })
      .fill("Análise do gestor pela interface.");
    await page
      .getByLabel("Resposta do gestor", { exact: true })
      .fill("Resposta enviada pela interface.");
    await page
      .getByRole("button", { name: "Confirmar ação", exact: true })
      .click();
    await expect(
      page.getByText("Aguardando validação", { exact: true }),
    ).toBeVisible();
    await logout();
    await login("ops_ouv");
    await page.goto(caseUrl);
    await page
      .getByRole("button", { name: "Aprovar resposta", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmar ação", exact: true })
      .click();
    await expect(
      page.getByText("Resposta aprovada", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Registrar resposta final e concluir",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Resposta institucional final", { exact: true })
      .fill("Retorno final validado no navegador.");
    await page
      .getByLabel("Como a resposta foi disponibilizada ao manifestante?", {
        exact: true,
      })
      .fill("Contato pessoal registrado.");
    await page
      .getByRole("button", { name: "Confirmar ação", exact: true })
      .click();
    await expect(page.getByText("Concluído", { exact: true })).toBeVisible();
    await page.screenshot({
      path: "test-results/case-detail-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw new Error("Overflow no detalhe móvel.");
    await page.screenshot({
      path: "test-results/case-detail-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("link", { name: "Relatórios", exact: true }).click();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Exportar Excel", exact: true })
      .click();
    await (await download).saveAs("test-results/report-browser.xlsx");
    expect(errors).toEqual([]);
    console.log(
      "OK: UI — cadastro, dashboard, registro, encaminhamento, resposta por outro perfil, aprovação, conclusão e download Excel.",
    );
    console.log(
      "OK: navegador Chromium — login, recuperação, navegação, auditoria, refresh, layout móvel e logout.",
    );
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise((r) => server.close(r));
    await pool.end();
  }
}
