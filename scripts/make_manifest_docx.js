const fs=require('fs');
const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType,BorderStyle,
  ShadingType,HeadingLevel,PageOrientation,AlignmentType}=require('docx');
const rows=JSON.parse(fs.readFileSync('/tmp/badges.json'));

const COLS=[["File name",2650],["Badge",2250],["Rarity",1250],["Rendered",1150],
            ["Trigger event",2450],["Earn rule",4650]];
const TOTAL=COLS.reduce((a,c)=>a+c[1],0);
const HEAD="1F2937", HEADTXT="FFFFFF", ALT="F5EFE0", BORD="D8C79A";

function cell(text,w,{bold=false,color="1c1a17",bg=null,size=15,align=AlignmentType.LEFT}={}){
  return new TableCell({
    width:{size:w,type:WidthType.DXA},
    shading:bg?{type:ShadingType.CLEAR,fill:bg,color:"auto"}:undefined,
    margins:{top:40,bottom:40,left:70,right:70},
    children:[new Paragraph({alignment:align,children:[new TextRun({text:text||"",bold,color,size})]})]
  });
}
function headRow(){
  return new TableRow({tableHeader:true,children:COLS.map(([t,w])=>
    cell(t,w,{bold:true,color:HEADTXT,bg:HEAD,size:16}))});
}
const body=rows.map((r,i)=>{
  const bg=i%2?ALT:null;
  const rd=r.rendered==="Yes";
  return new TableRow({children:[
    cell(r.file_name,COLS[0][1],{bg,size:14,color:"333333"}),
    cell(r.name,COLS[1][1],{bg,bold:true,size:15}),
    cell(r.rarity,COLS[2][1],{bg,size:14}),
    cell(rd?"Yes":"TO DO",COLS[3][1],{bg,size:14,bold:!rd,color:rd?"2E7D32":"B00020",align:AlignmentType.CENTER}),
    cell(r.trigger_event,COLS[4][1],{bg,size:13,color:"444444"}),
    cell(r.earn_rule+(r.notes?("  ["+r.notes+"]"):""),COLS[5][1],{bg,size:14}),
  ]});
});
const table=new Table({
  columnWidths:COLS.map(c=>c[1]),
  width:{size:TOTAL,type:WidthType.DXA},
  borders:["top","bottom","left","right","insideHorizontal","insideVertical"].reduce((o,k)=>{
    o[k]={style:BorderStyle.SINGLE,size:2,color:BORD};return o;},{}),
  rows:[headRow(),...body]
});

const doc=new Document({
  styles:{default:{document:{run:{font:"Calibri"}}}},
  sections:[{
    properties:{page:{size:{width:12240,height:15840,orientation:PageOrientation.LANDSCAPE},
      margin:{top:600,bottom:600,left:600,right:600}}},
    children:[
      new Paragraph({heading:HeadingLevel.HEADING_1,
        children:[new TextRun({text:"NMAO Badge Manifest — 100 Badges",color:"1c1a17"})]}),
      new Paragraph({children:[new TextRun({
        text:"File name paired with earn-rule for every badge. Editable master — tweak any cell (earn rules, thresholds, names), then export to PDF to share. 93/100 rendered; the 7 marked TO DO still need art.",
        italics:true,color:"6b655c",size:17})]}),
      new Paragraph({children:[new TextRun({text:" ",size:8})]}),
      table
    ]
  }]
});
Packer.toBuffer(doc).then(b=>{fs.writeFileSync('/sessions/relaxed-clever-thompson/mnt/GitHub/NMAO-Tournament/docs/badge-manifest.docx',b);console.log('wrote docx',b.length);});
