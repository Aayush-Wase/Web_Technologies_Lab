import type { Attribute, ClassKind, ClassNode, Diagram, Method, RelationType, Visibility } from './types';
import { DEFAULT_OPTIONS } from './types';
import { newAttribute, newMethod, uid } from './factory';

const MODS = /^(public|private|protected|static|final|abstract)\s+/;

interface Parsed {
  vis: Visibility;
  isStatic: boolean;
  isFinal: boolean;
  isAbstract: boolean;
  rest: string;
}

function eatModifiers(spec: string, defaultVis: Visibility): Parsed {
  let rest = spec.trim();
  const out: Parsed = { vis: defaultVis, isStatic: false, isFinal: false, isAbstract: false, rest };
  let m: RegExpExecArray | null;
  while ((m = MODS.exec(rest))) {
    const w = m[1];
    if (w === 'public' || w === 'private' || w === 'protected') out.vis = w;
    if (w === 'static') out.isStatic = true;
    if (w === 'final') out.isFinal = true;
    if (w === 'abstract') out.isAbstract = true;
    rest = rest.slice(m[0].length);
  }
  out.rest = rest;
  return out;
}

function attr(spec: string): Attribute {
  const p = eatModifiers(spec, 'private');
  const [decl, ...def] = p.rest.split('=');
  const idx = decl.trim().lastIndexOf(' ');
  return newAttribute({
    type: decl.trim().slice(0, idx).trim(),
    name: decl.trim().slice(idx + 1).trim(),
    visibility: p.vis,
    isStatic: p.isStatic,
    isFinal: p.isFinal,
    defaultValue: def.join('=').trim(),
  });
}

function method(spec: string): Method {
  const p = eatModifiers(spec, 'public');
  const open = p.rest.indexOf('(');
  const close = p.rest.lastIndexOf(')');
  const head = p.rest.slice(0, open).trim();
  const idx = head.lastIndexOf(' ');
  return newMethod({
    returnType: idx === -1 ? 'void' : head.slice(0, idx).trim(),
    name: head.slice(idx + 1).trim(),
    params: p.rest.slice(open + 1, close).trim(),
    visibility: p.vis,
    isStatic: p.isStatic,
    isAbstract: p.isAbstract,
  });
}

interface Spec {
  name: string;
  kind?: ClassKind;
  attrs?: string[];
  methods?: string[];
  constants?: string[];
  note?: string;
  pkg?: string;
}

function build(name: string, specs: Spec[], rels: [string, RelationType, string, string?, string?, string?][]): Diagram {
  const classes: ClassNode[] = specs.map((s) => ({
    id: uid('c'),
    name: s.name,
    kind: s.kind ?? 'class',
    pkg: s.pkg ?? '',
    note: s.note ?? '',
    x: 0,
    y: 0,
    attributes: (s.attrs ?? []).map(attr),
    methods: (s.methods ?? []).map(method),
    constants: s.constants ?? [],
  }));
  const id = (n: string) => classes.find((c) => c.name === n)!.id;
  return {
    name,
    classes,
    relationships: rels.map(([s, type, t, label, sm, tm]) => ({
      id: uid('r'),
      type,
      source: id(s),
      target: id(t),
      label: label ?? '',
      sourceMult: sm ?? '',
      targetMult: tm ?? '',
    })),
    options: { ...DEFAULT_OPTIONS },
  };
}

export interface Example {
  id: string;
  title: string;
  description: string;
  build: () => Diagram;
}

export const EXAMPLES: Example[] = [
  {
    id: 'library',
    title: 'Library system',
    description: 'Inheritance, an enum, an interface and a few associations.',
    build: () => {
      const d = build(
        'Library System',
        [
          {
            name: 'Person',
            kind: 'abstract',
            note: 'A person who interacts with the library.',
            attrs: ['private String id', 'private String name', 'private String email'],
            methods: ['public abstract String getRole()', 'public String getDisplayName()'],
          },
          {
            name: 'Member',
            attrs: ['private LocalDate joinedOn', 'private int maxLoans = 5'],
            methods: ['public String getRole()', 'public boolean canBorrow()'],
          },
          {
            name: 'Librarian',
            attrs: ['private String employeeNumber'],
            methods: ['public String getRole()', 'public void registerMember(Member member)'],
          },
          {
            name: 'Library',
            attrs: ['private String name', 'private String address'],
            methods: ['public void addBook(Book book)', 'public Book findByIsbn(String isbn)'],
          },
          {
            name: 'Book',
            attrs: ['private String isbn', 'private String title', 'private String author', 'private BookStatus status'],
            methods: ['public boolean isAvailable()', 'public void markAs(BookStatus status)'],
          },
          {
            name: 'Loan',
            attrs: ['private LocalDate borrowedOn', 'private LocalDate dueOn'],
            methods: ['public boolean isOverdue()', 'public double calculateFine()'],
          },
          {
            name: 'BookStatus',
            kind: 'enum',
            constants: ['AVAILABLE', 'BORROWED', 'RESERVED', 'LOST'],
          },
          {
            name: 'Searchable',
            kind: 'interface',
            methods: ['List<Book> search(String query)'],
          },
        ],
        [
          ['Member', 'inheritance', 'Person'],
          ['Librarian', 'inheritance', 'Person'],
          ['Library', 'composition', 'Book', 'catalog', '1', '0..*'],
          ['Library', 'aggregation', 'Member', 'members', '1', '0..*'],
          ['Library', 'realization', 'Searchable'],
          ['Loan', 'association', 'Book', 'book', '', '1'],
          ['Loan', 'association', 'Member', 'borrower', '', '1'],
          ['Book', 'association', 'BookStatus', 'status'],
          ['Librarian', 'dependency', 'Member'],
        ],
      );
      return d;
    },
  },
  {
    id: 'shapes',
    title: 'Shapes & polymorphism',
    description: 'An abstract base class with concrete subclasses and an interface.',
    build: () =>
      build(
        'Shapes',
        [
          { name: 'Drawable', kind: 'interface', methods: ['void draw()'] },
          {
            name: 'Shape',
            kind: 'abstract',
            attrs: ['protected String color', 'private static int count'],
            methods: ['public abstract double area()', 'public abstract double perimeter()', 'public String describe()'],
          },
          { name: 'Circle', attrs: ['private double radius'], methods: ['public double area()', 'public double perimeter()'] },
          {
            name: 'Rectangle',
            attrs: ['private double width', 'private double height'],
            methods: ['public double area()', 'public double perimeter()'],
          },
          {
            name: 'Triangle',
            attrs: ['private double a', 'private double b', 'private double c'],
            methods: ['public double area()', 'public double perimeter()'],
          },
          { name: 'Drawing', attrs: ['private String title'], methods: ['public double totalArea()', 'public void render()'] },
        ],
        [
          ['Shape', 'realization', 'Drawable'],
          ['Circle', 'inheritance', 'Shape'],
          ['Rectangle', 'inheritance', 'Shape'],
          ['Triangle', 'inheritance', 'Shape'],
          ['Drawing', 'composition', 'Shape', 'shapes', '1', '0..*'],
        ],
      ),
  },
  {
    id: 'shop',
    title: 'E-commerce',
    description: 'Orders, payments and a strategy-style interface with two implementations.',
    build: () =>
      build(
        'Online Shop',
        [
          {
            name: 'Customer',
            attrs: ['private String name', 'private String email', 'private Address address'],
            methods: ['public Order placeOrder(List<Product> items)'],
          },
          {
            name: 'Address',
            attrs: ['private String street', 'private String city', 'private String postalCode', 'private String country'],
          },
          {
            name: 'Order',
            attrs: ['private LocalDateTime createdAt', 'private OrderStatus status'],
            methods: ['public BigDecimal total()', 'public void pay(Payment payment)', 'public void cancel()'],
          },
          {
            name: 'OrderLine',
            attrs: ['private int quantity', 'private BigDecimal unitPrice'],
            methods: ['public BigDecimal subtotal()'],
          },
          {
            name: 'Product',
            attrs: ['private String sku', 'private String title', 'private BigDecimal price'],
            methods: ['public boolean inStock()'],
          },
          { name: 'OrderStatus', kind: 'enum', constants: ['NEW', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'] },
          { name: 'Payment', kind: 'interface', methods: ['boolean authorize(BigDecimal amount)', 'void refund(BigDecimal amount)'] },
          { name: 'CreditCardPayment', attrs: ['private String cardNumber', 'private String holder'] },
          { name: 'PayPalPayment', attrs: ['private String account'] },
        ],
        [
          ['Customer', 'association', 'Order', 'orders', '1', '0..*'],
          ['Customer', 'composition', 'Address', 'address', '1', '1'],
          ['Order', 'composition', 'OrderLine', 'lines', '1', '1..*'],
          ['OrderLine', 'association', 'Product', 'product', '', '1'],
          ['Order', 'association', 'OrderStatus', 'status'],
          ['Order', 'dependency', 'Payment'],
          ['CreditCardPayment', 'realization', 'Payment'],
          ['PayPalPayment', 'realization', 'Payment'],
        ],
      ),
  },
];
