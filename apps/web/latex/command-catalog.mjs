// Explicit insertion metadata only; this is not a parser or renderer capability claim.
// References: https://mathlive.io/mathfield/reference/commands/
// https://ctan.org/pkg/amsfonts (symbol names are provided by amssymb).
const groups = {
  relation: [
    ['leq','小于等于','Less than or equal'], ['geq','大于等于','Greater than or equal'],
    ['neq','不等于','Not equal'], ['approx','近似等于','Approximately equal'],
    ['equiv','等价','Equivalent'], ['sim','相似','Similar'], ['simeq','相似或等于','Similar or equal'],
    ['propto','正比于','Proportional to'], ['ll','远小于','Much less than'], ['gg','远大于','Much greater than'],
  ],
  set: [
    ['in','属于','Element of'], ['notin','不属于','Not an element of'], ['ni','包含元素','Contains element'],
    ['subset','子集','Subset'], ['supset','超集','Superset'], ['subseteq','子集或相等','Subset or equal'],
    ['supseteq','超集或相等','Superset or equal'], ['cup','并集','Union'], ['cap','交集','Intersection'],
    ['setminus','集合差','Set difference'], ['emptyset','空集','Empty set'], ['varnothing','空集变体','Empty set variant'],
  ],
  arrow: [
    ['to','向右箭头','Right arrow'], ['leftarrow','向左箭头','Left arrow'], ['rightarrow','向右箭头','Right arrow'],
    ['leftrightarrow','双向箭头','Left-right arrow'], ['Leftarrow','向左双线箭头','Left double arrow'],
    ['Rightarrow','向右双线箭头','Right double arrow'], ['Leftrightarrow','双向双线箭头','Left-right double arrow'],
    ['mapsto','映射到','Maps to'], ['uparrow','向上箭头','Up arrow'], ['downarrow','向下箭头','Down arrow'],
  ],
  operator: [
    ['sin','正弦','Sine'], ['cos','余弦','Cosine'], ['tan','正切','Tangent'], ['cot','余切','Cotangent'],
    ['sec','正割','Secant'], ['csc','余割','Cosecant'], ['sinh','双曲正弦','Hyperbolic sine'],
    ['cosh','双曲余弦','Hyperbolic cosine'], ['tanh','双曲正切','Hyperbolic tangent'],
    ['log','对数','Logarithm'], ['ln','自然对数','Natural logarithm'], ['exp','指数函数','Exponential'],
    ['lim','极限','Limit'], ['sup','上确界','Supremum'], ['inf','下确界','Infimum'],
    ['max','最大值','Maximum'], ['min','最小值','Minimum'], ['det','行列式','Determinant'],
    ['gcd','最大公约数','Greatest common divisor'],
  ],
  greek: [
    ['alpha','小写阿尔法','Lowercase alpha'], ['beta','小写贝塔','Lowercase beta'],
    ['gamma','小写伽马','Lowercase gamma'], ['delta','小写德尔塔','Lowercase delta'],
    ['epsilon','小写艾普西龙','Lowercase epsilon'], ['varepsilon','艾普西龙变体','Epsilon variant'],
    ['theta','小写西塔','Lowercase theta'], ['vartheta','西塔变体','Theta variant'],
    ['lambda','小写兰姆达','Lowercase lambda'], ['mu','小写缪','Lowercase mu'],
    ['nu','小写纽','Lowercase nu'], ['xi','小写克西','Lowercase xi'], ['pi','小写派','Lowercase pi'],
    ['rho','小写柔','Lowercase rho'], ['sigma','小写西格马','Lowercase sigma'],
    ['tau','小写陶','Lowercase tau'], ['phi','小写斐','Lowercase phi'], ['varphi','斐变体','Phi variant'],
    ['chi','小写希','Lowercase chi'], ['psi','小写普西','Lowercase psi'], ['omega','小写欧米伽','Lowercase omega'],
    ['Gamma','大写伽马','Uppercase gamma'], ['Delta','大写德尔塔','Uppercase delta'],
    ['Theta','大写西塔','Uppercase theta'], ['Lambda','大写兰姆达','Uppercase lambda'],
    ['Xi','大写克西','Uppercase xi'], ['Pi','大写派','Uppercase pi'], ['Sigma','大写西格马','Uppercase sigma'],
    ['Phi','大写斐','Uppercase phi'], ['Psi','大写普西','Uppercase psi'], ['Omega','大写欧米伽','Uppercase omega'],
  ],
};

export const mathCommandCatalog = Object.entries(groups).flatMap(([category, entries]) =>
  entries.map(([name, zh, en]) => ({
    name, latex: '\\' + name, category, labels: { zh, en },
    packages: name === 'varnothing' ? ['amssymb'] : [],
  })),
);
