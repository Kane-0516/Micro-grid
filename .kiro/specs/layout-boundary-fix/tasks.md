# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** — Edge Intersection Missed by Point Sampling
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate `_rect_fits` returns `True` when rectangle edges cross polygon edges
  - **Scoped PBT Approach**: Scope the property to concrete failing cases — construct rectangle/polygon pairs where:
    - All 9 sample points (4 corners + 4 midpoints + 1 center) are inside the polygon
    - At least one rectangle edge intersects a polygon edge
    - Use a 28m × 5.6m rectangle with a polygon boundary crossing the long edge at the 7m mark (between corner at 0m and midpoint at 14m)
    - Also test: diagonal boundary crossing, concave notch between sample points, short edge crossing
  - Test that `_rect_fits(corners, polygon)` returns `False` for all such inputs (from Expected Behavior in design)
  - Bug Condition: `isBugCondition(rect_corners, polygon)` = all 9 sample points inside AND at least one rect edge intersects a polygon edge
  - Run test on UNFIXED code — expect FAILURE (this confirms the bug exists: `_rect_fits` incorrectly returns `True`)
  - Document counterexamples found (e.g., "`_rect_fits` returns `True` for a rectangle whose long edge crosses the polygon boundary at 7m")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** — Non-Buggy Inputs Produce Identical Results
  - **IMPORTANT**: Follow observation-first methodology
  - **Step 1 — Observe**: Run `_rect_fits` on UNFIXED code with non-buggy inputs (cases where `isBugCondition` returns `False`):
    - Fully contained rectangles (all edges well inside polygon): observe `_rect_fits` returns `True`
    - Rectangles with at least one corner outside polygon: observe `_rect_fits` returns `False`
    - Rectangles with all corners inside but at least one midpoint outside: observe `_rect_fits` returns `False`
  - **Step 2 — Write property-based tests** capturing observed behavior patterns:
    - Property: for all rectangles fully contained in a convex polygon (no edge intersections), `_rect_fits` returns `True`
    - Property: for all rectangles with any corner outside the polygon, `_rect_fits` returns `False`
    - Property: for all rectangles with all corners inside but a midpoint outside, `_rect_fits` returns `False`
  - Use `hypothesis` library for property-based test generation with random rectangle/polygon combinations
  - Verify tests PASS on UNFIXED code (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Implement the boundary edge intersection fix
  - [x] 3.1 Add `_segments_intersect` helper function
    - Implement segment-segment intersection using cross-product orientation method
    - Given segments (p1, p2) and (p3, p4), compute orientations of four triplets
    - Return `True` if segments properly intersect (crossing, not just touching at endpoints)
    - Handle collinear/degenerate cases
    - Add to `backend/app/services/layout_optimizer.py` in the geometry utilities section
    - _Bug_Condition: isBugCondition(rect_corners, polygon) where rect edges cross polygon edges undetected_
    - _Expected_Behavior: segmentsIntersect correctly identifies all crossing segment pairs_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 Add `_rect_edges_intersect_polygon` helper function
    - Check whether any of the 4 rectangle edges intersects any of the N polygon edges
    - Iterate over 4 rect edges × N polygon edges = 4N segment intersection tests
    - Short-circuit on first intersection found (return `True` immediately)
    - Add to `backend/app/services/layout_optimizer.py` after `_segments_intersect`
    - _Bug_Condition: isBugCondition(rect_corners, polygon) where edge crossings go undetected_
    - _Expected_Behavior: _rect_edges_intersect_polygon returns True when any rect edge crosses any polygon edge_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Modify `_rect_fits` to include edge intersection check
    - After existing point-in-polygon check passes for all 9 sample points, add edge intersection check
    - If `_rect_edges_intersect_polygon(corners, poly)` returns `True`, return `False`
    - This is a pure addition — existing point sampling logic is unchanged
    - Performance: edge check runs only when all 9 sample points pass, so most rejected candidates are still caught early by point sampling
    - _Bug_Condition: isBugCondition(rect_corners, polygon) = all points inside AND edge intersection exists_
    - _Expected_Behavior: _rect_fits returns False when any rect edge intersects any polygon edge_
    - _Preservation: For inputs where no edge intersection exists, behavior is identical to original_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** — Edge Intersection Detection
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior: `_rect_fits` returns `False` when edges cross
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** — Non-Buggy Inputs Produce Identical Results
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Checkpoint — Ensure all tests pass
  - Run the full test suite to confirm all tests pass
  - Verify bug condition exploration test passes (edge intersections now detected)
  - Verify preservation property tests pass (non-buggy behavior unchanged)
  - Ensure no regressions in existing project tests
  - Ask the user if questions arise
