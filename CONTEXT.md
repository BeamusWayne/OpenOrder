# OpenOrder glossary

This file is the ubiquitous language. It contains no framework or database details.

- **Customer** — the person placing an order, including a guest session.
- **Store** — a physical shop of a brand, with location, hours, and pickup or delivery.
- **Item / SKU / Modifier** — a sellable drink, a concrete purchasable variant, and options such as sugar or ice.
- **Cart** — the unsubmitted basket attached to a Customer and usually a Thread.
- **Order** — a submitted purchase with a frozen price snapshot. Status moves `draft_confirmed → paid → accepted → making → ready → completed`, or `cancelled`.
- **Payment** — a one-to-one mock charge for an Order.
- **Thread** — one conversation. Short-term agent memory lives here.
- **Intent** — whether a user turn is `ordering`, `order_followup`, or `out_of_scope`. Out-of-scope turns never enter catalog, cart, or checkout tools.
- **UI Block** — a structured card the server emits (store list, modifier picker, confirm, pay). Clients only render and send the action back.
- **Simulator** — a deterministic local catalog generator. It is not a production data source.
