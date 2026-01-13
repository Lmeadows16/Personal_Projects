# app.py
import datetime as dt
from pathlib import Path
import streamlit as st

import db
from invoice_pdf import build_invoice_pdf
from settings import DEFAULT_HOURLY_RATE, DEFAULT_TAX_RATE

st.set_page_config(page_title="Handyman Invoicer", layout="wide")

db.init_db()

st.title("Handyman Invoicer")

tab1, tab2 = st.tabs(["Clients", "Create Invoice"])

# ---------------- Clients ----------------
with tab1:
    st.subheader("Add a client")
    with st.form("add_client"):
        name = st.text_input("Client name *")
        phone = st.text_input("Phone")
        email = st.text_input("Email")
        address = st.text_area("Address")
        submitted = st.form_submit_button("Save client")
        if submitted:
            if not name.strip():
                st.error("Client name is required.")
            else:
                client_id = db.create_client(name.strip(), phone.strip(), email.strip(), address.strip())
                st.success(f"Saved client: {name} (ID {client_id})")

    st.subheader("Client list")
    clients = db.list_clients()
    if clients:
        st.dataframe(
            [{"ID": c["client_id"], "Name": c["name"], "Phone": c["phone"], "Email": c["email"]} for c in clients],
            use_container_width=True
        )
    else:
        st.info("No clients yet. Add your first client above.")

# ---------------- Create Invoice ----------------
with tab2:
    clients = db.list_clients()
    if not clients:
        st.warning("Add a client first in the Clients tab.")
        st.stop()

    st.subheader("Invoice details")

    client_map = {f"{c['name']} (ID {c['client_id']})": c["client_id"] for c in clients}
    client_label = st.selectbox("Select client", list(client_map.keys()))
    client_id = client_map[client_label]

    colA, colB, colC = st.columns(3)
    with colA:
        issue_date = st.date_input("Issue date", value=dt.date.today())
    with colB:
        due_date = st.date_input("Due date", value=dt.date.today() + dt.timedelta(days=14))
    with colC:
        tax_rate = st.number_input("Tax rate (e.g., 0.055 = 5.5%)", value=float(DEFAULT_TAX_RATE), step=0.001, format="%.3f")

    notes = st.text_area("Notes (optional)", placeholder="Payment terms, warranty note, etc.")

    st.markdown("---")
    st.subheader("Line items")

    if "items" not in st.session_state:
        st.session_state["items"] = []

    with st.expander("Add labor"):
        col1, col2, col3 = st.columns(3)
        with col1:
            labor_desc = st.text_input("Labor description", value="Labor")
        with col2:
            labor_hours = st.number_input("Hours", min_value=0.0, value=1.0, step=0.5)
        with col3:
            labor_rate = st.number_input("Hourly rate", min_value=0.0, value=float(DEFAULT_HOURLY_RATE), step=1.0)

        if st.button("Add labor line"):
            st.session_state["items"].append({
                "description": f"{labor_desc} ({labor_hours:g} hrs @ ${labor_rate:,.2f}/hr)",
                "qty": float(labor_hours),
                "unit_price": float(labor_rate),
                "category": "labor",
            })
            st.success("Added labor line item.")

    with st.expander("Add material / misc"):
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            item_desc = st.text_input("Description", key="mat_desc")
        with col2:
            qty = st.number_input("Qty", key="mat_qty", min_value=0.0, value=1.0, step=1.0)
        with col3:
            unit = st.number_input("Unit price", key="mat_unit", min_value=0.0, value=0.0, step=1.0)
        with col4:
            category = st.selectbox("Category", ["material", "misc"], key="mat_cat")

        if st.button("Add item"):
            if not item_desc.strip():
                st.error("Description required.")
            else:
                st.session_state["items"].append({
                    "description": item_desc.strip(),
                    "qty": float(qty),
                    "unit_price": float(unit),
                    "category": category,
                })
                st.success("Added item.")

    st.markdown("### Current items")
    if st.session_state["items"]:
        # show + allow remove
        for idx, it in enumerate(st.session_state["items"]):
            cols = st.columns([6, 1, 2, 2, 1.5])
            cols[0].write(it["description"])
            cols[1].write(it["category"])
            cols[2].write(f"Qty: {it['qty']:g}")
            cols[3].write(f"Unit: ${it['unit_price']:,.2f}")
            if cols[4].button("Remove", key=f"rm_{idx}"):
                st.session_state["items"].pop(idx)
                st.rerun()

        subtotal = sum(it["qty"] * it["unit_price"] for it in st.session_state["items"])
        tax = subtotal * float(tax_rate)
        total = subtotal + tax
        st.write(f"**Subtotal:** ${subtotal:,.2f}  |  **Tax:** ${tax:,.2f}  |  **Total:** ${total:,.2f}")
    else:
        st.info("Add at least one line item.")

    st.markdown("---")

    if st.button("Generate Invoice PDF", type="primary", disabled=(len(st.session_state["items"]) == 0)):
        year = issue_date.year
        inv_num = db.next_invoice_number(year)
        invoice_id = db.create_invoice(
            invoice_number=inv_num,
            client_id=client_id,
            issue_date=str(issue_date),
            due_date=str(due_date),
            notes=notes.strip(),
            tax_rate=float(tax_rate),
        )
        for it in st.session_state["items"]:
            db.add_item(invoice_id, it["description"], it["qty"], it["unit_price"], it["category"])

        data = db.get_invoice_with_items(invoice_id)
        pdf_path = build_invoice_pdf(data)
        db.set_invoice_pdf_path(invoice_id, pdf_path)

        st.success(f"Created invoice {inv_num}")
        with open(pdf_path, "rb") as f:
            st.download_button(
                "Download PDF",
                data=f.read(),
                file_name=Path(pdf_path).name,
                mime="application/pdf"
            )

        # reset items after generation
        st.session_state["items"] = []
