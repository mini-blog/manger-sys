"""Reproducible A4 page-count check of DESIGN.md (sketch appendix excluded)."""
from pathlib import Path
import re, html
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os
from pypdf import PdfReader
font=os.environ.get('DESIGN_FONT','/System/Library/Fonts/Supplemental/Songti.ttc')
pdfmetrics.registerFont(TTFont('DesignCJK',font,subfontIndex=4))
pdfmetrics.registerFont(TTFont('DesignBold',font,subfontIndex=1))
root=Path(__file__).resolve().parents[1]
text=(root/'DESIGN.md').read_text().split('## 附录：')[0]
style=ParagraphStyle('body',fontName='DesignCJK',fontSize=10.5,leading=15.5,wordWrap='CJK',spaceAfter=5)
small=ParagraphStyle('table',parent=style,fontSize=9.5,leading=13.5,spaceAfter=0)
h1=ParagraphStyle('title',parent=style,fontName='DesignBold',fontSize=17,leading=23,spaceAfter=10)
h2=ParagraphStyle('section',parent=style,fontName='DesignBold',fontSize=12,leading=17,spaceBefore=6,spaceAfter=6,keepWithNext=True)
def markup(s):
 s=re.sub(r'\[([^\]]+)\]\([^)]+\)',r'\1',s)
 s=html.escape(s.replace('**',''))
 return s
story=[];lines=text.splitlines();i=0
while i<len(lines):
 line=lines[i].strip()
 if line.startswith('|'):
  rows=[]
  while i<len(lines) and lines[i].strip().startswith('|'):
   cells=lines[i].strip().strip('|').split('|')
   if not all(re.fullmatch(r'[\s:\-]+',c) for c in cells): rows.append([Paragraph(markup(c.strip()),small) for c in cells])
   i+=1
  width=A4[0]-72
  t=Table(rows,colWidths=[width*.255,width*.745],repeatRows=1,hAlign='LEFT')
  t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e8eeeb')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,-1),.35,colors.HexColor('#d0d9d4')),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4)]))
  story.extend([t,Spacer(1,7)]);continue
 if line.startswith('## 4.'): story.append(PageBreak())
 if line and line!='---':
  s=h1 if line.startswith('# ') else h2 if line.startswith('## ') else style
  story.append(Paragraph(markup(re.sub(r'^#+\s*','',line)),s))
 i+=1
out=root/'output/pdf/DESIGN.pdf';out.parent.mkdir(parents=True,exist_ok=True)
def page(c,doc):
 c.setFont('DesignCJK',8);c.setFillColor(colors.HexColor('#64736a'));c.drawString(36,22,'StudentSys | Design | A4 | Sketches in DESIGN.md appendix');c.drawRightString(A4[0]-36,22,str(doc.page))
SimpleDocTemplate(str(out),pagesize=A4,rightMargin=36,leftMargin=36,topMargin=32,bottomMargin=35,title='StudentSys design').build(story,onFirstPage=page,onLaterPages=page)
count=len(PdfReader(out).pages)
print(f'{out}: {count} A4 pages (body only)')
if count>3: raise SystemExit('Design exceeds the assignment 3-page limit')
