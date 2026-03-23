// src/utils/tickets/index.js
import { ASSETS, createDoc, openPdfInNewWindow, generateAsyncPdfInNewWindow, loadImage } from "./shared";

import { renderPaperTicket } from "./paperTicket";
import { renderProductionTicket } from "./productionTicket";
import { renderDeliveryTicket } from "./deliveryTicket";
import { renderInvoiceTicket } from "./invoiceTicket";
import { renderOrderConfirmation } from "./orderConfirmationTicket";

export function openPaperTicketWindow(job) {
  try {
    const doc = createDoc();
    renderPaperTicket(doc, job);
    openPdfInNewWindow(doc, `PaperTicket_${job.jobId || "job"}.pdf`);
  } catch (err) {
    console.error("Paper ticket PDF failed:", err);
    alert("Unable to generate Paper Ticket PDF.");
  }
}

export function openProductionTicketWindow(job) {
  try {
    const doc = createDoc();
    renderProductionTicket(doc, job);
    openPdfInNewWindow(doc, `ProductionTicket_${job.jobId || "job"}.pdf`);
  } catch (err) {
    console.error("Production ticket PDF failed:", err);
    alert("Unable to generate Production Ticket PDF.");
  }
}

export function openDeliveryTicketWindow(job) {
  try {
    const doc = createDoc();
    renderDeliveryTicket(doc, job);
    openPdfInNewWindow(doc, `DeliveryTicket_${job.jobId || "job"}.pdf`);
  } catch (err) {
    console.error("Delivery ticket PDF failed:", err);
    alert("Unable to generate Delivery Ticket PDF.");
  }
}

export function openInvoiceTicketWindow(job) {
  try {
    const doc = createDoc();
    renderInvoiceTicket(doc, job);
    openPdfInNewWindow(doc, `InvoiceTicket_${job.jobId || "job"}.pdf`);
  } catch (err) {
    console.error("Invoice ticket PDF failed:", err);
    alert("Unable to generate Invoice Ticket PDF.");
  }
}

export function openBulkInvoiceTicketWindow(jobs, filename = "InvoiceTickets_Bulk.pdf") {
  const validJobs = Array.isArray(jobs) ? jobs.filter(Boolean) : [];
  if (validJobs.length === 0) {
    alert("No invoices selected.");
    return;
  }

  generateAsyncPdfInNewWindow(async (doc) => {
    validJobs.forEach((job, index) => {
      if (index > 0) doc.addPage();
      renderInvoiceTicket(doc, job);
    });
  }, filename);
}

export function openOrderConfirmationWindow(job) {
  generateAsyncPdfInNewWindow(async (doc) => {
    const logoData = await loadImage(ASSETS.logoImg, doc);
    await renderOrderConfirmation(doc, job, logoData);
  }, `OrderConfirmation_${job.jobId || "job"}.pdf`);
}

export function openAllTicketsWindow(job) {
  generateAsyncPdfInNewWindow(async (doc) => {
    renderPaperTicket(doc, job);
    doc.addPage();

    renderProductionTicket(doc, job);
    doc.addPage();

    renderDeliveryTicket(doc, job);
    doc.addPage();

    renderInvoiceTicket(doc, job);

    const logoData = await loadImage(ASSETS.logoImg, doc);
    doc.addPage();
    await renderOrderConfirmation(doc, job, logoData);
  }, `AllTickets_${job.jobId || "job"}.pdf`);
}
