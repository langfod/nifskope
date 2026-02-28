/* MSVC compatibility shim for GCC-specific __attribute__ syntax */
#ifndef MSVC_COMPAT_H
#define MSVC_COMPAT_H

#ifdef _MSC_VER
#  ifndef __attribute__
#    define __attribute__(x)
#  endif
#  ifndef __restrict
#    define __restrict __restrict
#  endif
#endif

#endif /* MSVC_COMPAT_H */
