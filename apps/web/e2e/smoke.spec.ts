import { expect, test } from '@playwright/test';

/**
 * Der Weg, für den es die Anwendung gibt: Strecke wählen, Zahlen ansehen,
 * GPX herunterladen.
 *
 * Der Zustand kommt aus der Adresszeile statt aus Klicks auf die Karte. Das
 * prüft den teilbaren Link gleich mit und macht den Test unabhängig davon, wo
 * genau auf der Kachel ein Klick landet.
 */

const HIKE = '/de?s=hiking&p=scenic&w=47.55940,11.89720;47.74780,12.33220';

test('berechnet eine Route und exportiert sie als GPX', async ({ page }) => {
  await page.goto(HIKE);

  await expect(page.getByRole('radio', { name: 'Wandern' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'schönste' })).toBeChecked();

  // Länge und Dauer erscheinen, sobald die Berechnung durch ist.
  const distance = page.getByText(/\d+([.,]\d+)?\s*km/).first();
  await expect(distance).toBeVisible();

  await expect(page.getByText('Aufstieg')).toBeVisible();
  await expect(page.getByText('Untergrund')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'GPX herunterladen' }).click();

  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^trailforge-wandern-\d+km\.gpx$/);

  const stream = await file.createReadStream();
  const gpx = (
    await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    })
  ).toString('utf8');

  expect(gpx).toContain('<gpx version="1.1" creator="TrailForge"');
  expect(gpx).toContain('<trkseg>');
  expect(gpx.match(/<trkpt /g)?.length ?? 0).toBeGreaterThan(100);
});

test('ändert die Route, wenn die Präferenz wechselt', async ({ page }) => {
  await page.goto(HIKE);

  const readDistance = async (): Promise<string> => {
    const value = page.locator('dd').first();
    await expect(value).toBeVisible();
    return (await value.innerText()).trim();
  };

  const scenic = await readDistance();

  // Geklickt wird die Beschriftung, so wie es auch ein Mensch tut: das
  // Eingabefeld selbst ist für Hilfstechnik da und optisch verborgen.
  await page.getByText('kürzeste', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'kürzeste' })).toBeChecked();
  await expect(page.getByText('Route wird berechnet')).toBeVisible();
  await expect(page.getByText('Route wird berechnet')).toBeHidden();

  const shortest = await readDistance();

  // Die kürzeste Variante darf nicht länger sein als die schönste.
  const toMeters = (text: string) => Number(text.replace(/[^\d,.]/g, '').replace(',', '.')) * 1000;
  expect(toMeters(shortest)).toBeLessThanOrEqual(toMeters(scenic) * 1.02);

  // Und der Zustand steht in der Adresszeile.
  await expect(page).toHaveURL(/p=shortest/);
});

test('erklärt einen unerreichbaren Punkt', async ({ page }) => {
  // Mitten im Mittelmeer: dort endet kein Weg.
  await page.goto('/de?s=hiking&p=fastest&w=35.00000,18.00000;35.10000,18.10000');

  await expect(page.getByText('Das hat nicht geklappt')).toBeVisible();
});
