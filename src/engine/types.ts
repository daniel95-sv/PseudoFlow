export type DataType = 'Entero' | 'Real' | 'Cadena' | 'Caracter' | 'Logico' | 'Objeto' | 'Arreglo' | 'Indefinido';

export interface Token {
  type: string;
  value: string;
  line: number;
  col: number;
}

export type ASTNode =
  | ProgramNode
  | DeclarationNode
  | DimensionNode
  | AssignmentNode
  | ReadNode
  | WriteNode
  | IfNode
  | SwitchNode
  | WhileNode
  | RepeatNode
  | ForNode
  | SubprogramNode
  | ReturnNode
  | ClassNode
  | MethodNode
  | CallStatementNode
  | CommentNode;

export interface BaseNode {
  type: string;
  line: number;
}

export interface ProgramNode extends BaseNode {
  type: 'Program';
  name: string;
  body: ASTNode[];
  subprograms: SubprogramNode[];
  classes: ClassNode[];
}

export interface DeclarationNode extends BaseNode {
  type: 'Declaration';
  variableName: string;
  dataType: string;
  isPrivate?: boolean;
}

export interface DimensionNode extends BaseNode {
  type: 'Dimension';
  name: string;
  sizes: ExpressionNode[];
  dataType: string;
}

export interface AssignmentNode extends BaseNode {
  type: 'Assignment';
  target: TargetNode;
  value: ExpressionNode;
}

export interface TargetNode {
  name: string;
  indices?: ExpressionNode[]; // for arrays
  member?: string; // for objects: obj.field
  isThis?: boolean;
}

export interface ReadNode extends BaseNode {
  type: 'Read';
  targets: TargetNode[];
}

export interface WriteNode extends BaseNode {
  type: 'Write';
  expressions: ExpressionNode[];
  noNewline?: boolean;
}

export interface IfNode extends BaseNode {
  type: 'If';
  condition: ExpressionNode;
  thenBranch: ASTNode[];
  elseBranch?: ASTNode[];
}

export interface SwitchCase {
  values: ExpressionNode[];
  body: ASTNode[];
}

export interface SwitchNode extends BaseNode {
  type: 'Switch';
  expression: ExpressionNode;
  cases: SwitchCase[];
  defaultCase?: ASTNode[];
}

export interface WhileNode extends BaseNode {
  type: 'While';
  condition: ExpressionNode;
  body: ASTNode[];
}

export interface RepeatNode extends BaseNode {
  type: 'Repeat';
  condition: ExpressionNode;
  body: ASTNode[];
}

export interface ForNode extends BaseNode {
  type: 'For';
  variableName: string;
  startValue: ExpressionNode;
  endValue: ExpressionNode;
  stepValue?: ExpressionNode;
  body: ASTNode[];
}

export interface Parameter {
  name: string;
  dataType: string;
  isReference: boolean;
}

export interface SubprogramNode extends BaseNode {
  type: 'Subprogram';
  name: string;
  parameters: Parameter[];
  returnType?: string;
  body: ASTNode[];
}

export interface ReturnNode extends BaseNode {
  type: 'Return';
  value?: ExpressionNode;
}

export interface ClassNode extends BaseNode {
  type: 'Class';
  name: string;
  superClass?: string;
  fields: DeclarationNode[];
  methods: MethodNode[];
}

export interface MethodNode extends BaseNode {
  type: 'Method';
  name: string;
  isPublic: boolean;
  isConstructor: boolean;
  parameters: Parameter[];
  returnType?: string;
  body: ASTNode[];
}

export interface CallStatementNode extends BaseNode {
  type: 'CallStatement';
  call: ExpressionNode;
}

export interface CommentNode extends BaseNode {
  type: 'Comment';
  text: string;
}

export type ExpressionNode =
  | LiteralNode
  | VariableNode
  | BinaryOpNode
  | UnaryOpNode
  | ArrayAccessNode
  | MemberAccessNode
  | CallNode
  | NewNode
  | ThisNode
  | SuperCallNode;

export interface LiteralNode {
  type: 'Literal';
  value: any;
  raw: string;
  dataType: DataType;
}

export interface VariableNode {
  type: 'Variable';
  name: string;
}

export interface BinaryOpNode {
  type: 'BinaryOp';
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface UnaryOpNode {
  type: 'UnaryOp';
  operator: string;
  argument: ExpressionNode;
}

export interface ArrayAccessNode {
  type: 'ArrayAccess';
  name: string;
  indices: ExpressionNode[];
  object?: ExpressionNode;
}

export interface MemberAccessNode {
  type: 'MemberAccess';
  object: ExpressionNode;
  member: string;
  args?: ExpressionNode[];
}

export interface CallNode {
  type: 'Call';
  callee: string;
  args: ExpressionNode[];
}

export interface NewNode {
  type: 'New';
  className: string;
  args: ExpressionNode[];
}

export interface ThisNode {
  type: 'This';
  member?: string;
}

export interface SuperCallNode {
  type: 'SuperCall';
  methodName: string;
  args: ExpressionNode[];
}

// Execution runtime state
export interface ObjectInstance {
  id: string; // e.g. "Persona#1"
  className: string;
  fields: Record<string, any>;
}

export interface TraceStep {
  stepNumber: number;
  lineNumber: number;
  action: string;
  variables: Record<string, string>;
  changedVar?: string;
  outputLog?: string;
}

export interface TestCaseResult {
  passed: boolean;
  inputs: string[];
  expectedOutputs: string[];
  actualOutputs: string[];
  error?: string;
}
