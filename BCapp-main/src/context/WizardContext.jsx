// src/context/WizardContext.jsx
import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { createJob, saveJob, upsertCustomer } from "../utils/api";
import { normalizeStockKey } from "../utils/stocks";

const STEP_LABELS = [
  "Product",
  "Customize",
  "Finalize",
  "Shipping",
  "Billing",
  "Confirm",
];

export const STEP_PRODUCT = 1;
export const STEP_CUSTOMIZE = 2;
export const STEP_FINALIZE = 3;
export const STEP_SHIPPING = 4;
export const STEP_BILLING = 5;
export const STEP_CONFIRM = 6;

const BUSINESS_CARD_PRODUCT = {
  id: "business-cards",
  name: "Business Cards",
  size: { w: 3.5, h: 2 },
};

function createInitialStepStatus() {
  const obj = {};
  STEP_LABELS.forEach((label) => {
    obj[label] = "pending";
  });
  return obj;
}

function createInitialJobDraft() {
  return {
    jobId: null,
    ticketNo: null,
    site: "NORTH",
    orderDate: null,
    shipmentDate: null,
    stock: "uncoated",
    size: { ...BUSINESS_CARD_PRODUCT.size },
    versions: [],
    totalQty: 0,
    price: null,
    pricingMeta: null,
    customer: null,
    product: BUSINESS_CARD_PRODUCT,
    status: "",
    isDeleted: false,
    ticketPreview: "",
  };
}

function createInitialTotals() {
  return {
    subtotal: 0,
    shipping: 0,
    tax: 0,
    grandTotal: 0,
    calculatedSubtotal: 0,
    calculatedTax: 0,
    calculatedTotal: 0,
    overrideSubtotal: null,
  };
}

const initialState = {
  ui: {
    step: STEP_PRODUCT,
    maxStep: STEP_PRODUCT,
    stepStatus: createInitialStepStatus(),
    placingOrder: false,
    orderPlaced: false,
    orderError: "",
  },
  order: {
    title: "",
    orderedBy: "",
    product: BUSINESS_CARD_PRODUCT,
    jobDraft: createInitialJobDraft(),
    cart: [],
    shipping: null,
    billing: null,
    totals: createInitialTotals(),

    status: "",
    isDeleted: false,
    deletedAt: null,
    deletedBy: "",
    deletedReason: "",
  },
};

function isDeletedLike(obj) {
  return !!(obj?.isDeleted || obj?.deletedAt || obj?.status === "deleted");
}

function safeStr(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function normalizeStepNumber(value, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(STEP_CONFIRM, Math.max(STEP_PRODUCT, numericValue));
}

function normalizeState(maybeState) {
  const s = maybeState && typeof maybeState === "object" ? maybeState : {};

  const uiIn = s.ui && typeof s.ui === "object" ? s.ui : {};
  const orderIn = s.order && typeof s.order === "object" ? s.order : {};

  const stepStatusIn =
    uiIn.stepStatus && typeof uiIn.stepStatus === "object"
      ? uiIn.stepStatus
      : {};

  const jobDraftIn =
    orderIn.jobDraft && typeof orderIn.jobDraft === "object"
      ? orderIn.jobDraft
      : {};

  const totalsIn =
    orderIn.totals && typeof orderIn.totals === "object"
      ? orderIn.totals
      : {};

  const normalizedStepStatus = createInitialStepStatus();
  Object.keys(stepStatusIn).forEach((k) => {
    if (k in normalizedStepStatus) normalizedStepStatus[k] = stepStatusIn[k];
  });

  const normalizedStep = normalizeStepNumber(uiIn.step, initialState.ui.step);
  const normalizedMaxStep = normalizeStepNumber(uiIn.maxStep, initialState.ui.maxStep);

  const derivedDeleted =
    isDeletedLike(orderIn) || isDeletedLike(jobDraftIn) || isDeletedLike(orderIn?.cart?.[0]);

  const normalizedOrderDeletedMeta = {
    status:
      safeStr(orderIn.status) ||
      safeStr(jobDraftIn.status) ||
      (derivedDeleted ? "deleted" : ""),
    isDeleted: derivedDeleted,
    deletedAt: orderIn.deletedAt || jobDraftIn.deletedAt || null,
    deletedBy: safeStr(orderIn.deletedBy || jobDraftIn.deletedBy || ""),
    deletedReason: safeStr(orderIn.deletedReason || jobDraftIn.deletedReason || ""),
  };

  const normalizedJobDraftDeletedMeta = {
    status:
      safeStr(jobDraftIn.status) ||
      (normalizedOrderDeletedMeta.isDeleted ? "deleted" : ""),
    isDeleted:
      typeof jobDraftIn.isDeleted === "boolean"
        ? jobDraftIn.isDeleted
        : normalizedOrderDeletedMeta.isDeleted,
    deletedAt: jobDraftIn.deletedAt || normalizedOrderDeletedMeta.deletedAt || null,
    deletedBy: safeStr(jobDraftIn.deletedBy || normalizedOrderDeletedMeta.deletedBy || ""),
    deletedReason: safeStr(jobDraftIn.deletedReason || normalizedOrderDeletedMeta.deletedReason || ""),
  };

  const normalizedCart = Array.isArray(orderIn.cart) ? orderIn.cart : [];
  const patchedCart = normalizedCart.map((it) => ({
    ...it,
    status: safeStr(it?.status) || (normalizedOrderDeletedMeta.isDeleted ? "deleted" : ""),
    isDeleted:
      typeof it?.isDeleted === "boolean" ? it.isDeleted : normalizedOrderDeletedMeta.isDeleted,
    deletedAt: it?.deletedAt || normalizedOrderDeletedMeta.deletedAt || null,
    deletedBy: safeStr(it?.deletedBy || normalizedOrderDeletedMeta.deletedBy || ""),
    deletedReason: safeStr(it?.deletedReason || normalizedOrderDeletedMeta.deletedReason || ""),
  }));

  return {
    ...initialState,
    ...s,
    ui: {
      ...initialState.ui,
      ...uiIn,
      stepStatus: normalizedStepStatus,
      step: normalizedStep,
      maxStep: Math.max(normalizedMaxStep, normalizedStep),
      placingOrder: Boolean(uiIn.placingOrder),
      orderPlaced: Boolean(uiIn.orderPlaced),
      orderError: typeof uiIn.orderError === "string" ? uiIn.orderError : "",
    },
    order: {
      ...initialState.order,
      ...orderIn,
      title: typeof orderIn.title === "string" ? orderIn.title : "",
      orderedBy: typeof orderIn.orderedBy === "string" ? orderIn.orderedBy : "",
      product: orderIn.product || initialState.order.product,
      cart: patchedCart,
      shipping: orderIn.shipping ?? null,
      billing: orderIn.billing ?? null,
      totals: {
        ...createInitialTotals(),
        ...totalsIn,
      },
      jobDraft: {
        ...createInitialJobDraft(),
        ...jobDraftIn,
        ticketPreview: typeof jobDraftIn.ticketPreview === "string" ? jobDraftIn.ticketPreview : "",
        stock: normalizeStockKey(jobDraftIn.stock || "uncoated") || "uncoated",
        ...normalizedJobDraftDeletedMeta,
      },
      ...normalizedOrderDeletedMeta,
    },
  };
}

function wizardReducer(state, action) {
  switch (action.type) {
    case "SET_STEP":
      return {
        ...state,
        ui: { ...state.ui, step: action.payload },
      };

    case "MARK_STEP_COMPLETE": {
      const { label, nextStep } = action.payload;
      return {
        ...state,
        ui: {
          ...state.ui,
          stepStatus: { ...state.ui.stepStatus, [label]: "complete" },
          maxStep: Math.max(state.ui.maxStep, nextStep),
          step: nextStep,
        },
      };
    }

    case "MARK_STEP_ATTENTION": {
      const { label } = action.payload;
      if (state.ui.stepStatus[label] === "complete") return state;
      return {
        ...state,
        ui: {
          ...state.ui,
          stepStatus: { ...state.ui.stepStatus, [label]: "attention" },
        },
      };
    }

    case "SET_TITLE":
      return {
        ...state,
        order: { ...state.order, title: action.payload ?? "" },
      };

    case "SET_ORDERED_BY":
      return {
        ...state,
        order: { ...state.order, orderedBy: action.payload ?? "" },
      };

    /**
     * NEW: Hard reset the wizard to a clean “new order” state.
     * Key requirements:
     * - clears cart
     * - clears BOTH ticketNo and jobId (your logs show jobId was the culprit)
     * - clears deleted flags/meta so “pinned delete” logic doesn’t poison the new draft
     * - clears orderPlaced + orderError so Confirm UI is clean
     * - resets stepStatus/maxStep so the flow behaves like a new order
     */
    case "START_NEW_ORDER": {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem("businessCardCustomizeDraft");
          // Optional but recommended: prevents a refresh from rehydrating the stale ticket/deleted state.
          window.localStorage.removeItem("wizard_state_v1");
        } catch (e) {
          console.warn(e);
        }
      }

      return {
        ...state,
        ui: {
          ...initialState.ui,
        },
        order: {
          ...initialState.order,
          // Keep the currently-selected product if you ever add more products later.
          product: state.order?.product || initialState.order.product,
          // Preserve orderedBy if you want it “sticky” between orders; otherwise remove this line.
          orderedBy: state.order?.orderedBy || "",
        },
      };
    }

    case "UPDATE_DRAFT": {
      const nextDraft = { ...state.order.jobDraft, ...action.payload };

      // Never allow a deleted job to be implicitly "undeleted" by updates.
      // If the currently loaded job is deleted, keep the deleted flags pinned.
      if (isDeletedLike(state.order) || isDeletedLike(state.order.jobDraft)) {
        nextDraft.isDeleted = true;
        nextDraft.status = nextDraft.status || "deleted";
        nextDraft.deletedAt =
          nextDraft.deletedAt ||
          state.order.jobDraft.deletedAt ||
          state.order.deletedAt ||
          null;
        nextDraft.deletedBy =
          nextDraft.deletedBy ||
          state.order.jobDraft.deletedBy ||
          state.order.deletedBy ||
          "";
        nextDraft.deletedReason =
          nextDraft.deletedReason ||
          state.order.jobDraft.deletedReason ||
          state.order.deletedReason ||
          "";
      }

      return {
        ...state,
        order: {
          ...state.order,
          jobDraft: nextDraft,
        },
      };
    }

    case "COMMIT_DRAFT_TO_CART": {
      const merged = {
        ...state.order.jobDraft,
        ...action.payload,
        product: state.order.product,
      };

      // If a deleted job is loaded, keep cart item marked deleted too.
      const deletedPinned =
        isDeletedLike(state.order) || isDeletedLike(state.order.jobDraft);

      const finalMerged = deletedPinned
        ? {
            ...merged,
            isDeleted: true,
            status: merged.status || "deleted",
            deletedAt:
              merged.deletedAt ||
              state.order.jobDraft.deletedAt ||
              state.order.deletedAt ||
              null,
            deletedBy:
              merged.deletedBy ||
              state.order.jobDraft.deletedBy ||
              state.order.deletedBy ||
              "",
            deletedReason:
              merged.deletedReason ||
              state.order.jobDraft.deletedReason ||
              state.order.deletedReason ||
              "",
          }
        : merged;

      return {
        ...state,
        ui: { ...state.ui, orderPlaced: false, orderError: "" },
        order: {
          ...state.order,
          jobDraft: finalMerged,
          cart: [finalMerged],
          ...(deletedPinned
            ? {
                isDeleted: true,
                status: state.order.status || finalMerged.status || "deleted",
                deletedAt: state.order.deletedAt || finalMerged.deletedAt || null,
                deletedBy: state.order.deletedBy || finalMerged.deletedBy || "",
                deletedReason:
                  state.order.deletedReason || finalMerged.deletedReason || "",
              }
            : {}),
        },
      };
    }

    case "UPDATE_CART": {
      const nextCart = Array.isArray(action.payload) ? action.payload : [];

      // Keep delete pinned if this wizard state is representing a deleted job.
      if (isDeletedLike(state.order) || isDeletedLike(state.order.jobDraft)) {
        const pinned = nextCart.map((it) => ({
          ...it,
          isDeleted: true,
          status: it.status || "deleted",
          deletedAt:
            it.deletedAt ||
            state.order.jobDraft.deletedAt ||
            state.order.deletedAt ||
            null,
          deletedBy:
            it.deletedBy ||
            state.order.jobDraft.deletedBy ||
            state.order.deletedBy ||
            "",
          deletedReason:
            it.deletedReason ||
            state.order.jobDraft.deletedReason ||
            state.order.deletedReason ||
            "",
        }));
        return { ...state, order: { ...state.order, cart: pinned } };
      }

      return { ...state, order: { ...state.order, cart: nextCart } };
    }

    case "SET_SHIPPING":
      return {
        ...state,
        order: { ...state.order, shipping: action.payload },
      };

    case "SET_BILLING":
      return {
        ...state,
        order: { ...state.order, billing: action.payload },
      };

    case "SET_TOTALS":
      return {
        ...state,
        ui: { ...state.ui, orderError: "" },
        order: { ...state.order, totals: action.payload },
      };

    case "START_ORDER_PLACEMENT":
      return {
        ...state,
        ui: { ...state.ui, placingOrder: true, orderError: "" },
      };

    case "ORDER_SUCCESS": {
      const { ticketNo } = action.payload;

      const updatedDraft = {
        ...state.order.jobDraft,
        jobId: ticketNo,
        ticketNo,
        ticketPreview: "",
      };

      const updatedCart = (state.order.cart || []).map((item) => ({
        ...item,
        jobId: ticketNo,
        ticketNo,
      }));

      return {
        ...state,
        ui: {
          ...state.ui,
          placingOrder: false,
          orderPlaced: true,
          stepStatus: { ...state.ui.stepStatus, Confirm: "complete" },
        },
        order: {
          ...state.order,
          jobDraft: updatedDraft,
          cart: updatedCart,
        },
      };
    }

    case "ORDER_ERROR":
      return {
        ...state,
        ui: { ...state.ui, placingOrder: false, orderError: action.payload },
      };

    case "RESET_ORDER":
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem("businessCardCustomizeDraft");
          window.localStorage.removeItem("wizard_state_v1");
        } catch (e) {
          console.warn(e);
        }
      }
      return initialState;

    case "LOAD_EXISTING_ORDER":
      return normalizeState(action.payload);

    case "HYDRATE":
      return normalizeState(action.payload);

    default:
      return state;
  }
}

function getTicketFromState(state) {
  const draftTicket = state?.order?.jobDraft?.ticketNo || state?.order?.jobDraft?.jobId;
  const cartTicket = state?.order?.cart?.[0]?.ticketNo || state?.order?.cart?.[0]?.jobId;
  return draftTicket || cartTicket || null;
}

function patchCartWithTicket(cart, ticketNo) {
  const arr = Array.isArray(cart) ? cart : [];
  if (!ticketNo) return arr;
  return arr.map((it) => ({
    ...it,
    ticketNo: it?.ticketNo || ticketNo,
    jobId: it?.jobId || ticketNo,
  }));
}

const WizardContext = createContext(null);

export function WizardProvider({ children }) {
  const [state, dispatch] = useReducer(wizardReducer, initialState);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("wizard_state_v1");
      if (stored) {
        dispatch({ type: "HYDRATE", payload: JSON.parse(stored) });
      }
    } catch (e) {
      console.warn("Failed to load wizard state", e);
    }
  }, []);

  useEffect(() => {
    try {
      if (state.ui.step > 1 || state.order.cart.length > 0) {
        window.localStorage.setItem("wizard_state_v1", JSON.stringify(state));
      } else {
        window.localStorage.removeItem("wizard_state_v1");
      }
    } catch (e) {
      console.warn("Failed to save wizard state", e);
    }
  }, [state]);

  const resetWizard = useCallback(() => {
    dispatch({ type: "RESET_ORDER" });
  }, []);

  const placeOrder = useCallback(async () => {
    const { order } = state;

    const draft = order.jobDraft || {};
    const cartItem = order.cart?.[0] || {};

    // Canonical "current" job values: draft wins over cart.
    const current = { ...cartItem, ...draft };

    const existingTicket = getTicketFromState(state);

    console.log("existingTicket", existingTicket);
    console.log("draft.ticketNo", draft.ticketNo, "draft.jobId", draft.jobId);
    console.log("cart.ticketNo", cartItem.ticketNo, "cart.jobId", cartItem.jobId);
    console.log("orderPlaced", state.ui.orderPlaced, "step", state.ui.step);
    console.log("cart.length", order.cart?.length, "current keys", Object.keys(current || {}));

    // Soft-delete safety: never allow Update Order to run for deleted jobs.
    const isDeletedLoaded =
      isDeletedLike(order) || isDeletedLike(draft) || isDeletedLike(cartItem) || isDeletedLike(current);

    // Determine whether this is a brand new order.
    let finalTicket = existingTicket;
    let isNewOrder = !finalTicket;

    if (!current || Object.keys(current).length === 0) {
      dispatch({ type: "ORDER_ERROR", payload: "No job found to save." });
      return;
    }

    // If a deleted job is loaded, do not save. This prevents accidental resurrection.
    if (isDeletedLoaded) {
      dispatch({
        type: "ORDER_ERROR",
        payload: "This order is marked deleted and cannot be updated.",
      });
      return;
    }

    dispatch({ type: "START_ORDER_PLACEMENT" });

    try {

      const todayStr = new Date().toISOString().slice(0, 10);

      const customer = current.customer || {};
      const product = current.product || order.product || BUSINESS_CARD_PRODUCT;
      const price = current.price || {};

      const { shipping, billing, totals, title, orderedBy } = order;

      const base = price.baseSinglePrice ?? price.base ?? 0;
      const sidesSurcharge = price.sidesSurcharge ?? price.addons ?? 0;
      const priceTotal = price.total ?? base + sidesSurcharge;

      const computedOrderTitle =
        (title && title.trim()) || product?.name || "Order";

      const buildPayload = (ticketId) => ({
        ticketNo: ticketId,
        jobId: ticketId,

        site: current.site || "NORTH",
        orderTitle: computedOrderTitle,

        orderedBy: safeStr(orderedBy || ""),

        productId: product.id,
        productName: product.name,
        size: current.size || product.size,

        stock: normalizeStockKey(current.stock || "uncoated") || "uncoated",
        versionCount: current.versionCount ?? current.versions?.length ?? 0,
        totalQty: current.totalQty ?? 0,
        sides: current.pricingMeta?.sides || null,
        doubleVersionCount: current.pricingMeta?.doubleVersionCount ?? null,

        priceBaseSingle: base,
        priceSidesSurcharge: sidesSurcharge,
        priceTotal,

        customer,
        custId: customer.custId || "",
        custName: customer.custName || "",
        custContact: customer.custContact || "",
        custEmail: customer.custEmail || "",
        custPhone: customer.custPhone || "",
        custAddress: customer.custAddress || "",

        shippingMethod: shipping?.method || "Pickup",
        shippingCost: totals.shipping,
        shippingAddress: shipping?.address || null,
        shippingName: shipping?.address?.name || "",
        shippingLine1: shipping?.address?.line1 || "",
        shippingLine2: shipping?.address?.line2 || "",
        shippingCity: shipping?.address?.city || "",
        shippingRegion: shipping?.address?.region || "",
        shippingZip: shipping?.address?.zip || "",

        billingAddress: billing?.address || null,
        billingName: billing?.address?.name || "",
        billingLine1: billing?.address?.line1 || "",
        billingLine2: billing?.address?.line2 || "",
        billingCity: billing?.address?.city || "",
        billingRegion: billing?.address?.region || "",
        billingZip: billing?.address?.zip || "",
        paymentMethod: billing?.payment || "",

        subtotal: totals.subtotal,
        shippingAmount: totals.shipping,
        tax: totals.tax,
        grandTotal: totals.grandTotal,

        calculatedSubtotal: totals.calculatedSubtotal,
        calculatedTax: totals.calculatedTax,
        calculatedTotal: totals.calculatedTotal,
        overrideSubtotal: totals.overrideSubtotal,

        orderDate: current.orderDate || todayStr,
        shipmentDate: current.shipmentDate || todayStr,

        versions: current.versions || [],

        rawCart: patchCartWithTicket(order.cart, ticketId),
        rawShipping: shipping,
        rawBilling: billing,
      });

      if (isNewOrder) {
        const created = await createJob(buildPayload(finalTicket));
        finalTicket = created?.ticketNo || finalTicket;
        if (!finalTicket) throw new Error("Ticket allocation failed.");
      } else {
        const jobPayload = buildPayload(finalTicket);
        await saveJob(jobPayload, false);
      }

      const customerPayload = {
        ...customer,
        shipLine1: shipping?.address?.line1 || "",
        shipLine2: shipping?.address?.line2 || "",
        shipCity: shipping?.address?.city || "",
        shipState: shipping?.address?.region || "",
        shipZip: shipping?.address?.zip || "",
        billLine1: billing?.address?.line1 || "",
        billLine2: billing?.address?.line2 || "",
        billCity: billing?.address?.city || "",
        billState: billing?.address?.region || "",
        billZip: billing?.address?.zip || "",
      };

      await upsertCustomer(customerPayload);

      dispatch({ type: "ORDER_SUCCESS", payload: { ticketNo: finalTicket } });
    } catch (err) {
      console.error("Save Order Failed:", err);
      dispatch({
        type: "ORDER_ERROR",
        payload: err?.message || "Order failed.",
      });
    }
  }, [state]);

  // Expose a simple, reliable guard for Confirm button disabling:
  // Confirm can disable Update Order if this is true.
  const isCurrentOrderDeleted = useMemo(() => {
    const o = state.order || {};
    const d = o.jobDraft || {};
    const c = o.cart?.[0] || {};
    return isDeletedLike(o) || isDeletedLike(d) || isDeletedLike(c);
  }, [state.order]);

  const value = useMemo(
    () => ({
      state,
      dispatch,
      placeOrder,
      resetWizard,
      isCurrentOrderDeleted,
      constants: { STEP_LABELS, BUSINESS_CARD_PRODUCT },
    }),
    [state, placeOrder, resetWizard, isCurrentOrderDeleted]
  );

  return (
    <WizardContext.Provider value={value}>{children}</WizardContext.Provider>
  );
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error("useWizard must be used within a WizardProvider");
  }
  return context;
}
