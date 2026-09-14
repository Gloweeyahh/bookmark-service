# bookmark-service
An HTTP bookmark API that treats bad input as the main problem, not an edge case, 400s naming the exact field, never a 500, and duplicate creates recognized by URL so the same request twice leaves one row.
