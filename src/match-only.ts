// 独立达人匹配站编译期开关：仅保留「达人匹配」板块，且只使用三个新增达人库。
// 匹配池子：增量/优质达人库（incr，994）、潜力星川达人推荐（potential_new，1.28万）、星图达人推荐（potential，1.37万）。
// 隐藏：存量达人库（stock，233）及其数量、服务商自有/本机存量达人库（local_stock/CSV）、xc-tagger 自助打标入口。
// 数据源（主多维表格 + FaaS stage）、匹配与 AI 评分逻辑与星川决策工作台完全一致，仅在视图与请求入口层隔离，不改后端。
export const MATCH_ONLY = true;
