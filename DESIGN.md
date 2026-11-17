---
version: alpha
omitted:
  - section: colors
    reason: Rancher Shell owns the active light/dark semantic colors; this extension introduces no palette or theme override.
  - section: typography
    reason: Inherit Rancher Shell form typography and script fallbacks without loading fonts.
  - section: spacing
    reason: Native row/col form layout and Shell spacing utilities remain canonical.
  - section: rounded
    reason: Native Rancher form primitives own control geometry.
  - section: components
    reason: Existing Rancher LabeledInput, LabeledSelect, Banner and Loading are the maintained component system.
---

# CLO provisioning inside Rancher

## Overview

Product register: infrastructure operator filling native Rancher machine pools.
The task is to choose an existing CLO project/image, VM resources and network
profile. This is an extension of Rancher 2.15.3, not a new rave-technology application.
The visual reference is the installed Rancher provisioning form. A marketing
hero, additional navigation, custom design language or price estimate would
obscure the operator's task and is deliberately absent.

## Colors

Ownership model B: `@rancher/shell` and `@rancher/components` runtime themes
remain canonical. Components inherit body/input/text/error/primary roles from
their native owners; no copied hex values or global CSS token definitions.
Meaning is expressed in text as well as Banner tone. Test light and dark.

## Typography

Inherit the native heading, field label, help and input hierarchy. UUIDs are
values, never headings. Labels use RU/EN localization through Rancher `t()`;
raw API errors and token values never become visible copy.

## Layout

Native rows/columns, compact sections: project/image, compute, network, advanced.
The distinguishing domain element is the explicit private/public profile with
its operational consequence and stable-IP replacement note beside the control.
Use the existing document scroller. Keep layout usable in the narrow host panel;
do not add viewport-height or global overflow rules.

## Components

| Capability | Canonical owner | Extension responsibility | Verification |
|---|---|---|---|
| Form | Rancher cloudcredential/MachinePool hosts and LabeledInput | Credential test returns boolean; machine test returns true or errors; parent owns Save/name/roles/taints | Node behavior tests + real native host browser |
| Select/Listbox | Shell LabeledSelect | Localized catalogue options; preserve selected IDs; no automatic first selection | Catalog/config tests + open popup/keyboard browser |
| Loading/Error | Shell Loading and components Banner | Stable pending/error/empty/manual mode, safe correction text | Browser failure/slow response and scoped client tests |
| Credential | CloudCredential model + Shell proxy | Local masked draft, server credential reference, fresh successful commit only | Credential tests + native edit/view |
| Scrollbar | Rancher global document/controls stylesheet | No global changes or hidden scrollbar | Narrow viewport/theme browser |
| CRUD/Feedback | Rancher native parent hosts | No separate submit, confirmation or toast system | Native host save validation, no unintended resource creation |

The native select owns popup/keyboard/labels. The extension must not replace it
with a div-based menu. Field help and errors are localized and remain near their
controls. Form submissions and unsaved-change handling belong to native hosts;
no nested form or browser alert/confirm/prompt. View renders existing config and
never requests a credential or cloud inventory.

## Do's and Don'ts

- Preserve edits and chosen IDs through read errors and stale responses.
- Display the public pool limit and permit zero for delete-before-create.
- Keep existing hidden token when no replacement is entered; no token in URLs,
  logs, localStorage, machine config, screenshots or exposed error objects.
- Do not add arbitrary regions/networks, new VM/IP/NAT actions or unsupported
  capacities. Existing Go driver remains authoritative for cloud ownership.
- Use actual browser evidence for responsive, focus, popup and theme behavior;
  static audit alone does not establish accessibility or workflow correctness.
