-- Post-linebreak hlist widths in TeX sp; these are allocated boxes, not ink extents.
local output = assert(io.open("line-boxes.tsv", "w"))
luatexbase.add_to_callback("post_linebreak_filter", function(head)
  for line in node.traverse_id(node.id("hlist"), head) do
    if line.subtype == 1 then
      output:write(string.format("%d\t%d\t%d\n", line.width, line.height, line.depth))
    end
  end
  output:flush()
  return true
end, "lineae.reference.boxes")
