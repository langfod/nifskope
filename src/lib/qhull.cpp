/***** BEGIN LICENSE BLOCK *****

BSD License

Copyright (c) 2005-2015, NIF File Format Library and Tools
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:
1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.
3. The name of the NIF File Format Library and Tools project may not be
   used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR
IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT,
INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

***** END LICENCE BLOCK *****/

#include "common.hpp"
#include "qhull.h"

#include <QDebug>
#include <QByteArray>

extern "C"
{
#include <libqhull_r/libqhull_r.h>
#include <libqhull_r/qhull_ra.h>
}

#include "data/niftypes.h"

#include <algorithm>
#include <functional>
#include <math.h>


//! \file qhull.cpp Computes a convex hull

//! An interface to <a href="http://www.qhull.org">Qhull</a> for generating Havok-compatible convex shapes
QVector<Triangle> compute_convex_hull( const QVector<Vector3> & verts, QVector<Vector4> & hullVerts, QVector<Vector4> & hullNorms, float roundError )
{
	QVector<Triangle> tris;

	/* dimension of points */
	int dim = 3;
	/* number of points */
	int numpoints = 0;
	/* array of coordinates for each point */
	coordT * points = 0;
	/* True if qhull should free points in qh_freeqhull() or reallocation */
	boolT ismalloc = 0;
	/* option flags for qhull, see qh-quick.htm
	 * i: print vertices incident to each facet
	 * Qt: produce triangulated output
	 * En: max roundoff
	 */
	QString tempFlags = QString( "qhull i Qt E%1" ).arg( roundError );
	QByteArray flagsChar = tempFlags.toLatin1();
	char * flags = flagsChar.data();
	/* output from qh_produce_output()
	 * use NULL to skip qh_produce_output()
	 */
	FILE * outfile = stdout;
	/* error messages from qhull code */
	FILE * errfile = stderr;
	/* 0 if no error from qhull */
	int exitcode;
	/* set by FORALLfacets */
	facetT * facet;
	/* memory remaining after qh_memfreeshort */
	int curlong, totlong;

	/* vertexT is a struct containing coordinates etc. */
	vertexT * vertex, ** vertexp;
	setT * vertices;

	/* reentrant qhull context */
	qhT qh_qh;
	qhT * qh = &qh_qh;
	QHULL_LIB_CHECK

	qh_zero(qh, errfile);

	numpoints = verts.size();
	points = new coordT[3 * numpoints];

	// Shut up Code Analysis C6011
	if ( !points )
		return QVector<Triangle>();

	for ( int i = 0; i < numpoints; ++i ) {
		points[i * 3 + 0] = verts[i][0];
		points[i * 3 + 1] = verts[i][1];
		points[i * 3 + 2] = verts[i][2];
	}

	/* initialize dim, numpoints, points[], ismalloc here */
	exitcode = qh_new_qhull( qh, dim, numpoints, points, ismalloc,
		flags, outfile, errfile );

	if ( !exitcode ) {
		/* if no error */
		/* 'qh facet_list' contains the convex hull */
		FORALLfacets {
			/* from poly2.c */
			vertices = qh_facet3vertex( qh, facet );
			Vector4 hullNorm( facet->normal[0], facet->normal[1], facet->normal[2], facet->offset );
			hullNorms.append( hullNorm );

			if ( qh_setsize( qh, vertices ) == 3 ) {
				Triangle tri;
				int i = 0;
				FOREACHvertex_( vertices ) {
					tri[i++] = qh_pointid( qh, vertex->point );
					/* find the hull vertices */
					Vector4 hullVert( vertex->point[0], vertex->point[1], vertex->point[2], 0 );
					hullVerts.append( hullVert );
				}
				tris.push_back( tri );
			}

			qh_settempfree( qh, &vertices );
		}
	}

	qh_freeqhull( qh, !qh_ALL );
	qh_memfreeshort( qh, &curlong, &totlong );

	if ( curlong || totlong )
		fprintf( errfile, "qhull internal warning (main): did not free %d bytes of long memory (%d pieces)\n",
			totlong, curlong );

	delete[] points;
	return tris;
};
