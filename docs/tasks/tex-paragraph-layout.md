# TeX 段落排版层

实现放在 src/typesetting，断行和词间距由段落全局 boxes/glue/penalties 决策，以视图装饰接入编辑器。不会把显示换行写入 TeX，也不改 planPagination。英文断词使用 TeX Live 原始 hyphen.tex 表；源文件及其许可声明随项目保留。支持 TeX pt、spaceskip、罚值、断词例外和最小长度。

服务器 XeTeX 2023 生成的参考数据记录在 tests/fixtures/paragraph-layout/xelatex-reference.json，含三种宽度和自定义 spaceskip。测试逐行比较正文、连字符、行宽和行距，再验证编辑撤销后的源码、工程、分页、选区与输入法。

仍不能宣称任意 XeLaTeX 文档逐行一致：xeCJK 标点压缩与不同 CJK 字体度量、任意字体的全部 fontdimen、其他语言断词、宏展开后的局部断行参数、浮动绕排和多栏需进一步权威对照。现有实现对不支持或无法找到合法断行的段落保留浏览器路径。上述范围不得被报告成完整 XeLaTeX 排版兼容。
## Appendix

支持 \\appendix 结构切换、article 的 A/A.1 编号，以及 report/book/ctexbook/ctexrep 的章附录编号；大纲、目录、交叉引用共用编号逻辑。标记不占正文高度，保留原始命令和撤销历史。章标题的独立分页、章级公式/图表计数与宏包自定义附录样式仍需另行对照，不应宣称完整文档类视觉兼容。

中文段落尚未完成 xeCJK 权威校准，因此暂时维持原有浏览器排版，避免影响中文选区与输入。
