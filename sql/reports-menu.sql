-- ============================================================
-- AI Usage report — sidebar menu entry
-- Run in database: Resume_Tracker
-- Same pattern as the '/my-action' page. Safe to run more than once.
-- ============================================================

-- 1. Page (flat menu item; the UI picks the icon from routeIconMap)
INSERT INTO public.mst_masterpages
    (parent_id, page_name, routelink, icon, display_order,
     is_active, is_parent, is_deleted, created_by, created_date)
SELECT
    0, 'Report', '/reports/ai-usage', NULL,
    (SELECT COALESCE(MAX(display_order), 0) + 1 FROM public.mst_masterpages),
    TRUE, TRUE, FALSE, 1, NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM public.mst_masterpages
    WHERE routelink = '/reports/ai-usage' AND is_deleted = FALSE
)
RETURNING page_id;

-- 2. Permissions — every role of the company gets every permission on the page.
--    To limit who sees AI cost data, add e.g.:  AND r.role_id IN (1, 2)
INSERT INTO public.tbl_role_permission (role_id, page_id, permission_id, is_allowed)
SELECT r.role_id, m.page_id, perm.permission_id, TRUE
FROM public.tbl_roles r
CROSS JOIN public.mst_masterpages m
CROSS JOIN public.mst_permission perm
WHERE r.company_id = 1                      -- your company_id
  AND m.routelink = '/reports/ai-usage'
  AND m.is_deleted = FALSE
  AND NOT EXISTS (
      SELECT 1 FROM public.tbl_role_permission rp
      WHERE rp.role_id       = r.role_id
        AND rp.page_id       = m.page_id
        AND rp.permission_id = perm.permission_id
  );

-- 3. Check
-- SELECT page_id, page_name, routelink, display_order FROM public.mst_masterpages
-- WHERE routelink = '/reports/ai-usage';
