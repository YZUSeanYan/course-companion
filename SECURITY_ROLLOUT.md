# Security patch rollout notes

This change is a security hardening proposal, **not** a live production deployment. Do not merge without staging tests.

- **Account activation:** Every `POST /v1/accounts/activate` now requires the previously issued and verified SMS code, even if an old deployment sets `REQUIRE_ACTIVATION_CODE=false`. Update older Android clients first. Check SMS integration and test new and existing accounts.
- **Document pages:** A new `document_access` SQLite table binds every uploaded document ID to the account (or a legacy standalone device), and page GETs return 404 for unauthorized access. Existing rendered documents do not have owner records; users may need to re-upload them after rollout.
- **PDF pages:** A 40-megapixel render-size precheck reduces oversized-image allocation risks. Very large-format PDFs may be rejected.
- **Audio uploads:** The Lecsync upload path no longer writes new classroom audio to the unencrypted `LECSYNC_UPLOAD_ROOT` staging directory. Existing files on production disks are **not** erased by this patch; inspect and remove or securely retire them after verifying no recovery dependencies.
- **Rate limiting:** Trial and activation code requests now use the ASGI peer/client address rather than trusting an arbitrary `X-Real-IP` request header. Configure trustworthy proxy headers and trusted proxy networks at the server/proxy layer.
- **Verification:** Run FastAPI tests, test account-device binding, verify document ownership across two accounts and multiple devices of one account, verify job creation and billing cleanup on provider errors, and confirm the PDF limit in a staging environment. Investigate historical documents/audio retention.

No deployed SMS settings, database contents, or production files are modified by creating this PR.
